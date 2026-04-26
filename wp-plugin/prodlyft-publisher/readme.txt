=== Prodlyft Publisher ===
Contributors: prodlyft
Tags: ai, blog, automation, content
Requires at least: 5.6
Tested up to: 6.5
Stable tag: 0.1.0
Requires PHP: 7.4
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Lets the Prodlyft Auto Blogger generate and publish posts on this site.

== Description ==

Adds a single REST namespace `/wp-json/prodlyft/v1/` so Prodlyft can:

* Confirm the connection (`/ping`)
* Read your existing categories (`/categories`) and tags (`/tags`)
* Create posts with featured images (`/posts`)

All endpoints require the `X-Prodlyft-Key` header. The key is generated
from the WP admin under **Settings → Prodlyft Publisher** and rotated /
revoked from the same screen.

== Installation ==

1. Upload the plugin folder to `/wp-content/plugins/`
2. Activate it from the **Plugins** screen
3. Go to **Settings → Prodlyft Publisher**, click **Generate API key**, and copy the key
4. Paste the key (and your site URL) into the Prodlyft dashboard at https://prodlyft.com/blogger

== Privacy ==

This plugin only stores a single option: the API key. It does not phone
home, run analytics, or transmit any data to third parties. Posts are
only created when Prodlyft makes an authenticated REST call.

== Changelog ==

= 0.1.0 =
* Initial release.
