<?php
/**
 * Plugin Name: Customize Partial Refresh
 * Description: Refresh parts of the Customizer preview instead of reloading the entire page.
 * Plugin URI: https://github.com/xwp/wp-customize-partial-refresh
 * Version: 0.5.1
 * Author: XWP, Weston Ruter
 * Author URI: https://xwp.co/
 * License: GPLv2+
 *
 * @package WordPress
 * @subpackage Customize
 */

/**
 * Copyright (c) 2016 XWP (https://xwp.co/)
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

/**
 * Bootstrap.
 *
 * This will be part of the WP_Customize_Manager::__construct() or another such class constructor in #coremerge.
 *
 * @param array                $components   Components.
 * @param WP_Customize_Manager $wp_customize Manager.
 * @return array Components.
 */
function customize_partial_refresh_filter_customize_loaded_components( $components, $wp_customize ) {

	require_once dirname( __FILE__ ) . '/php/class-wp-customize-selective-refresh.php';
	require_once dirname( __FILE__ ) . '/php/class-wp-customize-partial.php';
	require_once dirname( __FILE__ ) . '/php/class-wp-customize-nav-menus-partial-refresh.php';
	require_once dirname( __FILE__ ) . '/php/class-wp-customize-widgets-partial-refresh.php';

	$wp_customize->selective_refresh = new WP_Customize_Selective_Refresh( $wp_customize );
	if ( in_array( 'widgets', $components, true ) ) {
		$wp_customize->selective_refresh->widgets = new WP_Customize_Widgets_Partial_Refresh( $wp_customize );
	}
	if ( in_array( 'nav_menus', $components, true ) ) {
		$wp_customize->selective_refresh->nav_menus = new WP_Customize_Nav_Menus_Partial_Refresh( $wp_customize );
	}

	return $components;
}

add_filter( 'customize_loaded_components', 'customize_partial_refresh_filter_customize_loaded_components', 100, 2 );

// Bootstrap immediately in case the Customizer has already been initialized (as on WordPress.com VIP).
global $wp_customize;
if ( ! empty( $wp_customize ) && $wp_customize instanceof WP_Customize_Manager ) {
	$customize_loaded_components = array();
	if ( isset( $wp_customize->widgets ) ) {
		$customize_loaded_components[] = 'widgets';
	}
	if ( isset( $wp_customize->nav_menus ) ) {
		$customize_loaded_components[] = 'nav_menus';
	}
	customize_partial_refresh_filter_customize_loaded_components( $customize_loaded_components, $wp_customize );
	unset( $customize_loaded_components );
}
