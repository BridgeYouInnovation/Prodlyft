<?php
/**
 * Plugin Name:       Prodlyft Publisher
 * Plugin URI:        https://prodlyft.com
 * Description:       Lets the Prodlyft Auto Blogger create and publish posts on this site over a secure REST endpoint.
 * Version:           0.1.0
 * Requires at least: 5.6
 * Requires PHP:      7.4
 * Author:            Prodlyft
 * Author URI:        https://prodlyft.com
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       prodlyft-publisher
 *
 * The plugin adds a settings page where the WP admin can generate (and
 * rotate) a one-time API key. Prodlyft stores that key on its side and
 * sends it as `X-Prodlyft-Key` on every request to /wp-json/prodlyft/v1/*.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'PRODLYFT_OPT_KEY', 'prodlyft_publisher_api_key' );

/* -------------------------------------------------------------------------
 * Activation: stub the option so the settings page renders cleanly.
 * ----------------------------------------------------------------------- */
register_activation_hook( __FILE__, function () {
	if ( ! get_option( PRODLYFT_OPT_KEY ) ) {
		update_option( PRODLYFT_OPT_KEY, '' );
	}
} );

/* -------------------------------------------------------------------------
 * Settings page under Settings → Prodlyft Publisher.
 * ----------------------------------------------------------------------- */
add_action( 'admin_menu', function () {
	add_options_page(
		'Prodlyft Publisher',
		'Prodlyft Publisher',
		'manage_options',
		'prodlyft-publisher',
		'prodlyft_render_settings'
	);
} );

function prodlyft_render_settings() {
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}

	$msg = '';
	if ( isset( $_POST['prodlyft_action'] ) && check_admin_referer( 'prodlyft_publisher_nonce' ) ) {
		$action = sanitize_text_field( wp_unslash( $_POST['prodlyft_action'] ) );
		if ( 'generate' === $action || 'rotate' === $action ) {
			$key = wp_generate_password( 48, false, false );
			update_option( PRODLYFT_OPT_KEY, $key );
			$msg = 'rotate' === $action
				? '<div class="notice notice-warning"><p>Old key revoked. <strong>Save the new key now</strong> — it won\'t be shown again.</p></div>'
				: '<div class="notice notice-success"><p><strong>API key generated.</strong> Save it now — for security it won\'t be shown after you leave this page.</p></div>';
		} elseif ( 'revoke' === $action ) {
			update_option( PRODLYFT_OPT_KEY, '' );
			$msg = '<div class="notice notice-warning"><p>API key revoked. Prodlyft can no longer publish to this site until you generate a new one.</p></div>';
		}
	}

	$key       = get_option( PRODLYFT_OPT_KEY, '' );
	$has_key   = ! empty( $key );
	$site_root = esc_url( rest_url( 'prodlyft/v1' ) );

	?>
	<div class="wrap">
		<h1>Prodlyft Publisher</h1>
		<p>Lets the Prodlyft Auto Blogger generate and publish posts to this site.</p>
		<?php echo $msg; // phpcs:ignore WordPress.Security.EscapeOutput ?>

		<h2>Connection</h2>
		<table class="form-table" role="presentation">
			<tr>
				<th scope="row">REST endpoint</th>
				<td><code><?php echo esc_html( $site_root ); ?></code></td>
			</tr>
			<tr>
				<th scope="row">API key</th>
				<td>
					<?php if ( $has_key ) : ?>
						<input type="text" readonly value="<?php echo esc_attr( $key ); ?>" class="regular-text code" onfocus="this.select()" />
						<p class="description">Paste this key into the Prodlyft dashboard along with this site's URL: <code><?php echo esc_url( home_url( '/' ) ); ?></code></p>
					<?php else : ?>
						<em>Not generated yet.</em>
					<?php endif; ?>
				</td>
			</tr>
		</table>

		<form method="post" action="">
			<?php wp_nonce_field( 'prodlyft_publisher_nonce' ); ?>
			<?php if ( ! $has_key ) : ?>
				<p>
					<button type="submit" name="prodlyft_action" value="generate" class="button button-primary">Generate API key</button>
				</p>
			<?php else : ?>
				<p>
					<button type="submit" name="prodlyft_action" value="rotate" class="button">Rotate key</button>
					<button type="submit" name="prodlyft_action" value="revoke" class="button button-secondary" onclick="return confirm('Revoking the key will disconnect Prodlyft from this site. Continue?');">Revoke key</button>
				</p>
			<?php endif; ?>
		</form>

		<h2>What this plugin exposes</h2>
		<p>All endpoints are under <code>/wp-json/prodlyft/v1/</code> and require the <code>X-Prodlyft-Key</code> header.</p>
		<ul>
			<li><code>GET  /ping</code> — returns site info, used by Prodlyft to confirm the connection.</li>
			<li><code>GET  /categories</code> — list of categories so you can target posts.</li>
			<li><code>GET  /tags</code> — list of tags.</li>
			<li><code>POST /posts</code> — create a post (title, content, excerpt, status, category_ids, tag_names, featured_image_url).</li>
		</ul>

		<p style="color:#646970">Need help? Email <a href="mailto:prodlyft@gmail.com">prodlyft@gmail.com</a>.</p>
	</div>
	<?php
}

/* -------------------------------------------------------------------------
 * REST endpoints.
 * ----------------------------------------------------------------------- */

function prodlyft_check_key( WP_REST_Request $req ) {
	$saved  = (string) get_option( PRODLYFT_OPT_KEY, '' );
	if ( '' === $saved ) {
		return new WP_Error( 'no_key', 'API key not configured on this site.', array( 'status' => 401 ) );
	}
	$header = (string) $req->get_header( 'X-Prodlyft-Key' );
	// Use hash_equals to avoid timing leaks.
	if ( '' === $header || ! hash_equals( $saved, $header ) ) {
		return new WP_Error( 'forbidden', 'Invalid API key.', array( 'status' => 401 ) );
	}
	return true;
}

add_action( 'rest_api_init', function () {

	register_rest_route( 'prodlyft/v1', '/ping', array(
		'methods'             => 'GET',
		'permission_callback' => 'prodlyft_check_key',
		'callback'            => function () {
			return array(
				'ok'              => true,
				'plugin_version'  => '0.1.0',
				'site_name'       => get_bloginfo( 'name' ),
				'site_url'        => home_url( '/' ),
				'wp_version'      => get_bloginfo( 'version' ),
				'timezone'        => wp_timezone_string(),
				'language'        => get_locale(),
			);
		},
	) );

	register_rest_route( 'prodlyft/v1', '/categories', array(
		'methods'             => 'GET',
		'permission_callback' => 'prodlyft_check_key',
		'callback'            => function () {
			$out = array();
			foreach ( get_categories( array( 'hide_empty' => false, 'number' => 200 ) ) as $c ) {
				$out[] = array(
					'id'    => (int) $c->term_id,
					'name'  => $c->name,
					'slug'  => $c->slug,
					'count' => (int) $c->count,
				);
			}
			return $out;
		},
	) );

	register_rest_route( 'prodlyft/v1', '/tags', array(
		'methods'             => 'GET',
		'permission_callback' => 'prodlyft_check_key',
		'callback'            => function () {
			$out  = array();
			$tags = get_tags( array( 'hide_empty' => false, 'number' => 200 ) );
			if ( ! is_wp_error( $tags ) && is_array( $tags ) ) {
				foreach ( $tags as $t ) {
					$out[] = array(
						'id'    => (int) $t->term_id,
						'name'  => $t->name,
						'slug'  => $t->slug,
						'count' => (int) $t->count,
					);
				}
			}
			return $out;
		},
	) );

	register_rest_route( 'prodlyft/v1', '/posts', array(
		'methods'             => 'POST',
		'permission_callback' => 'prodlyft_check_key',
		'callback'            => 'prodlyft_create_post',
		'args'                => array(
			'title'   => array( 'required' => true, 'type' => 'string' ),
			'content' => array( 'required' => true, 'type' => 'string' ),
		),
	) );
} );

function prodlyft_create_post( WP_REST_Request $req ) {
	$status_in = (string) $req->get_param( 'status' );
	$status    = in_array( $status_in, array( 'draft', 'publish', 'pending', 'future' ), true ) ? $status_in : 'draft';

	$post_data = array(
		'post_title'   => wp_strip_all_tags( (string) $req->get_param( 'title' ) ),
		'post_content' => (string) $req->get_param( 'content' ),
		'post_excerpt' => (string) $req->get_param( 'excerpt' ),
		'post_status'  => $status,
		'post_type'    => 'post',
	);

	$cat_ids = $req->get_param( 'category_ids' );
	if ( is_array( $cat_ids ) && ! empty( $cat_ids ) ) {
		$post_data['post_category'] = array_map( 'intval', $cat_ids );
	}

	if ( 'future' === $status ) {
		$publish_at = (string) $req->get_param( 'publish_at' );
		if ( $publish_at ) {
			$post_data['post_date']     = $publish_at;
			$post_data['post_date_gmt'] = get_gmt_from_date( $publish_at );
		} else {
			$post_data['post_status'] = 'draft';
		}
	}

	$post_id = wp_insert_post( $post_data, true );
	if ( is_wp_error( $post_id ) ) {
		return new WP_Error( 'insert_failed', $post_id->get_error_message(), array( 'status' => 500 ) );
	}

	$tag_names = $req->get_param( 'tag_names' );
	if ( is_array( $tag_names ) && ! empty( $tag_names ) ) {
		wp_set_post_tags( $post_id, array_map( 'sanitize_text_field', $tag_names ), false );
	}

	$featured_image_url = (string) $req->get_param( 'featured_image_url' );
	$attached_image     = null;
	if ( $featured_image_url ) {
		$attach_id = prodlyft_sideload_image( $featured_image_url, $post_id );
		if ( ! is_wp_error( $attach_id ) ) {
			set_post_thumbnail( $post_id, $attach_id );
			$attached_image = wp_get_attachment_url( $attach_id );
		}
	}

	$post = get_post( $post_id );
	return array(
		'id'         => (int) $post->ID,
		'status'     => $post->post_status,
		'permalink'  => get_permalink( $post ),
		'edit_url'   => get_edit_post_link( $post->ID, '' ),
		'image_url'  => $attached_image,
	);
}

/**
 * Download a remote image and attach it to the given post as media.
 * Returns attachment ID or WP_Error.
 */
function prodlyft_sideload_image( $url, $post_id ) {
	require_once ABSPATH . 'wp-admin/includes/file.php';
	require_once ABSPATH . 'wp-admin/includes/media.php';
	require_once ABSPATH . 'wp-admin/includes/image.php';

	$tmp = download_url( $url, 30 );
	if ( is_wp_error( $tmp ) ) {
		return $tmp;
	}

	$file_array = array(
		'name'     => basename( wp_parse_url( $url, PHP_URL_PATH ) ?: 'featured.jpg' ),
		'tmp_name' => $tmp,
	);
	$attach_id = media_handle_sideload( $file_array, $post_id );
	if ( is_wp_error( $attach_id ) ) {
		@unlink( $tmp );
		return $attach_id;
	}
	return $attach_id;
}
