<?php
/**
 * Plugin Name: Headless Redirect (test rig)
 * Description: Stops WordPress serving the public front end and sends visitors to the decoupled frontend, while keeping admin, REST, GraphQL, cron and MainWP Child traffic intact.
 * Version:     1.0.0
 *
 * Drop this in wp-content/mu-plugins/. No activation needed.
 *
 * This is the step that actually makes a site "headless". Until WordPress
 * stops answering front-end requests, you have a normal site that happens to
 * also have a second frontend - and every front-end-facing check in a site
 * management dashboard will still pass, telling you nothing.
 *
 * Set the target below, or define HEADLESS_PUBLIC_URL in wp-config.php.
 */

defined( 'ABSPATH' ) || exit;

if ( ! defined( 'HEADLESS_PUBLIC_URL' ) ) {
	// e.g. 'https://front.example.com'
	define( 'HEADLESS_PUBLIC_URL', '' );
}

/**
 * Decide whether this request must be left alone.
 *
 * Erring toward "leave it alone" is deliberate. A redirect that swallows an
 * API call is much harder to diagnose than a page that failed to redirect.
 *
 * @return bool True when WordPress should handle the request itself.
 */
function headless_rig_request_is_exempt() {

	// Only ever redirect plain GETs. Every machine-to-machine WordPress
	// integration worth naming - including the MainWP Child connection -
	// talks over POST to the site root, and a 302 will break it.
	if ( ! isset( $_SERVER['REQUEST_METHOD'] ) || 'GET' !== strtoupper( sanitize_text_field( wp_unslash( $_SERVER['REQUEST_METHOD'] ) ) ) ) {
		return true;
	}

	if ( is_admin() || wp_doing_ajax() || wp_doing_cron() ) {
		return true;
	}

	if ( ( defined( 'REST_REQUEST' ) && REST_REQUEST ) || ( defined( 'XMLRPC_REQUEST' ) && XMLRPC_REQUEST ) ) {
		return true;
	}

	if ( defined( 'WP_CLI' ) && WP_CLI ) {
		return true;
	}

	// Keep an escape hatch: logged-in users can still view the WordPress
	// front end, which you will want when something looks wrong.
	if ( is_user_logged_in() ) {
		return true;
	}

	$uri = isset( $_SERVER['REQUEST_URI'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REQUEST_URI'] ) ) : '';

	$exempt_paths = array(
		'/wp-admin',
		'/wp-login.php',
		'/wp-json',
		'/wp-cron.php',
		'/xmlrpc.php',
		'/wp-content',
		'/wp-includes',
		'/graphql',
		'/robots.txt',
		'/favicon.ico',
		'/.well-known',
	);

	foreach ( $exempt_paths as $path ) {
		if ( 0 === strpos( $uri, $path ) ) {
			return true;
		}
	}

	// Belt and braces for MainWP. The Child plugin answers on the site root,
	// so any request carrying its signature or function parameters must pass
	// through untouched even if it somehow arrives as a GET.
	$mainwp_markers = array( 'mainwpsignature', 'mainwp_child', 'mainwpsignature_key', 'child_key' );
	foreach ( $mainwp_markers as $marker ) {
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended
		if ( isset( $_REQUEST[ $marker ] ) ) {
			return true;
		}
	}

	// phpcs:ignore WordPress.Security.NonceVerification.Recommended
	foreach ( array_keys( (array) $_REQUEST ) as $key ) {
		if ( 0 === stripos( (string) $key, 'mainwp' ) ) {
			return true;
		}
	}

	return false;
}

/**
 * Send public front-end traffic to the decoupled frontend.
 *
 * @return void
 */
function headless_rig_redirect() {

	if ( '' === HEADLESS_PUBLIC_URL ) {
		return;
	}

	if ( headless_rig_request_is_exempt() ) {
		return;
	}

	$uri    = isset( $_SERVER['REQUEST_URI'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REQUEST_URI'] ) ) : '/';
	$target = untrailingslashit( HEADLESS_PUBLIC_URL ) . $uri;

	// 302, not 301. You are testing - do not let a browser or an edge cache
	// memorise this while you are still changing your mind.
	wp_safe_redirect( $target, 302, 'Headless Redirect' );
	exit;
}
add_action( 'template_redirect', 'headless_rig_redirect', 0 );

/**
 * Allow redirects to the frontend host, which is not the WordPress host.
 *
 * @param string[] $hosts Allowed hosts.
 * @return string[]
 */
function headless_rig_allow_frontend_host( $hosts ) {
	if ( '' !== HEADLESS_PUBLIC_URL ) {
		$host = wp_parse_url( HEADLESS_PUBLIC_URL, PHP_URL_HOST );
		if ( $host ) {
			$hosts[] = $host;
		}
	}
	return $hosts;
}
add_filter( 'allowed_redirect_hosts', 'headless_rig_allow_frontend_host' );
