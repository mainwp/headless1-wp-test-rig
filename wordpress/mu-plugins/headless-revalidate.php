<?php
/**
 * Plugin Name: Headless Revalidate (test rig)
 * Description: Pings the decoupled frontend whenever content changes, so the public site stops serving a stale build.
 * Version:     1.0.0
 *
 * Drop this in wp-content/mu-plugins/ alongside headless-redirect.php.
 *
 * Why this exists: in a headless setup the dashboard reporting "update
 * applied" and the visitor seeing the change are two different events,
 * separated by however long the frontend's cache window is. This closes
 * that gap - and, more usefully for testing, gives you something concrete
 * to point a site management dashboard at.
 *
 * Define both of these in wp-config.php:
 *   define( 'HEADLESS_REVALIDATE_URL', 'https://front.example.com/api/revalidate' );
 *   define( 'HEADLESS_REVALIDATE_SECRET', 'the-same-secret-as-the-frontend' );
 */

defined( 'ABSPATH' ) || exit;

/**
 * Fire the frontend's revalidation webhook.
 *
 * @param string $slug Optional post slug to target. Empty flushes everything.
 * @return void
 */
function headless_rig_ping_frontend( $slug = '' ) {

	if ( ! defined( 'HEADLESS_REVALIDATE_URL' ) || ! defined( 'HEADLESS_REVALIDATE_SECRET' ) ) {
		return;
	}

	$response = wp_remote_post(
		HEADLESS_REVALIDATE_URL,
		array(
			// Non-blocking: never make an editor wait on the frontend, and
			// never let a frontend outage block a content update.
			'blocking' => false,
			'timeout'  => 5,
			'headers'  => array(
				'Content-Type'        => 'application/json',
				'X-Revalidate-Secret' => HEADLESS_REVALIDATE_SECRET,
			),
			'body'     => wp_json_encode( array( 'slug' => $slug ) ),
		)
	);

	if ( is_wp_error( $response ) ) {
		error_log( '[headless] revalidate ping failed: ' . $response->get_error_message() ); // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
	}
}

/**
 * Revalidate when a post transitions to or from published.
 *
 * @param string   $new_status New status.
 * @param string   $old_status Old status.
 * @param \WP_Post $post       The post.
 * @return void
 */
function headless_rig_on_transition( $new_status, $old_status, $post ) {

	if ( 'publish' !== $new_status && 'publish' !== $old_status ) {
		return;
	}

	if ( wp_is_post_revision( $post ) || wp_is_post_autosave( $post ) ) {
		return;
	}

	headless_rig_ping_frontend( $post->post_name );
}
add_action( 'transition_post_status', 'headless_rig_on_transition', 10, 3 );

// A plugin or theme update can change rendered output too. Worth pinging,
// and worth watching: this is the hook a site management dashboard would
// need to trigger for a headless site to look correct after an update run.
add_action( 'upgrader_process_complete', function () {
	headless_rig_ping_frontend();
}, 10, 0 );
