<?php
/**
 * Plugin Name: Customize Partial Refresh
 * Description: Refresh parts of a Customizer preview instead of reloading the entire page when a setting changed without transport=postMessage.
 * Plugin URI: https://github.com/xwp/wp-customize-partial-refresh
 * Version: 0.4
 * Author: XWP, Weston Ruter
 * Author URI: https://xwp.co/
 * License: GPLv2+
 */

/**
 * Copyright (c) 2015 XWP (https://xwp.co/)
 *
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License, version 2 or, at
 * your discretion, any later version, as published by the Free
 * Software Foundation.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program; if not, write to the Free Software
 * Foundation, Inc., 51 Franklin St, Fifth Floor, Boston, MA 02110-1301 USA
 */

require_once( __DIR__ . '/php/class-wp-customize-partial-refresh-plugin.php' );
require_once( __DIR__ . '/php/class-wp-customize-partial-refresh-widgets.php' );
require_once( __DIR__ . '/php/class-wp-customize-partial-refresh-exception.php' );
$GLOBALS['wp_customize_partial_refresh_plugin'] = new WP_Customize_Partial_Refresh_Plugin();
