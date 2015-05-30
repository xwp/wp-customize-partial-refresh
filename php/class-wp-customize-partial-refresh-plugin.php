<?php

class WP_Customize_Partial_Refresh_Plugin {

	const VERSION = '0.1';

	/**
	 * @var array
	 */
	public $config = array();

	/**
	 * @var string
	 */
	public $dir_path = '';

	/**
	 * @var string
	 */
	public $dir_url = '';

	/**
	 * @var WP_Customize_Partial_Refresh_Widgets
	 */
	public $widgets;

	/**
	 * @var array
	 */
	public $script_handles = array();

	/**
	 * @var array
	 */
	public $style_handles = array();

	/**
	 * Plugin bootstrap for Partial Refresh functionality.
	 */
	function __construct() {
		$plugin_location = $this->locate_plugin();
		$this->dir_path = $plugin_location['dir_path'];
		$this->dir_url = $plugin_location['dir_url'];
		$this->config = array();

		add_action( 'wp_default_scripts', array( $this, 'register_scripts' ), 11 );
		add_action( 'wp_default_styles', array( $this, 'register_styles' ), 11 );
		add_action( 'init', array( $this, 'init' ) );
		$this->widgets = new WP_Customize_Partial_Refresh_Widgets( $this );
	}

	/**
	 * Apply filters on the plugin configuration.
	 */
	function init() {
		$this->config = apply_filters( 'customize_partial_refresh_config', $this->config, $this );
		do_action( 'customize_partial_refresh_init', $this );
	}

	/**
	 * @param WP_Scripts $wp_scripts
	 * @action wp_default_scripts
	 */
	function register_scripts( $wp_scripts ) {
		$handle = 'customize-partial-refresh-base';
		$src = $this->get_dir_url( 'js/customize-partial-refresh-base.js' );
		$deps = array( 'customize-base' );
		$wp_scripts->add( $handle, $src, $deps, $this->get_version() );
		$this->script_handles['base'] = $handle;

		$handle = 'customize-partial-refresh-widgets-preview';
		$src = $this->get_dir_url( 'js/customize-partial-refresh-widgets-preview.js' );
		$deps = array( 'jquery', 'wp-util', 'customize-preview', 'customize-preview-widgets', $this->script_handles['base'] );
		$in_footer = true;
		$wp_scripts->add( $handle, $src, $deps, $this->get_version(), $in_footer );
		$this->script_handles['widgets-preview'] = $handle;

		$handle = 'customize-partial-refresh-widgets-pane';
		$src = $this->get_dir_url( 'js/customize-partial-refresh-widgets-pane.js' );
		$deps = array( 'jquery', 'wp-util', 'customize-controls', 'customize-widgets', $this->script_handles['base'] );
		$in_footer = true;
		$wp_scripts->add( $handle, $src, $deps, $this->get_version(), $in_footer );
		$this->script_handles['widgets-pane'] = $handle;
	}

	/**
	 * @param WP_Styles $wp_styles
	 * @action wp_default_styles
	 */
	function register_styles( $wp_styles ) {
		$handle = 'customize-partial-refresh-widgets-preview';
		$src = $this->get_dir_url( 'css/customize-partial-refresh-widgets-preview.css' );
		$deps = array();
		$wp_styles->add( $handle, $src, $deps, $this->get_version() );
		$this->style_handles['widgets-preview'] = $handle;
	}

	/**
	 * @return string
	 */
	function get_version() {
		// @todo Read from plugin metadata block
		return self::VERSION;
	}

	/**
	 * @param string $path
	 *
	 * @return string
	 */
	function get_dir_url( $path = '/' ) {
		return trailingslashit( $this->dir_url ) . ltrim( $path, '/' );
	}

	/**
	 * @param string $path
	 *
	 * @return string
	 */
	function get_dir_path( $path = '/' ) {
		return trailingslashit( $this->dir_path ) . ltrim( $path, '/' );
	}

	/**
	 * Version of plugin_dir_url() which works for plugins installed in the plugins directory,
	 * and for plugins bundled with themes.
	 *
	 * @throws Exception
	 * @return array
	 */
	public function locate_plugin() {
		$reflection = new ReflectionObject( $this );
		$file_name = $reflection->getFileName();
		if ( '/' !== DIRECTORY_SEPARATOR ) {
			$file_name = str_replace( DIRECTORY_SEPARATOR, '/', $file_name ); // Windows compat
		}
		$plugin_dir = preg_replace( '#(.*plugins[^/]*/[^/]+)(/.*)?#', '$1', $file_name, 1, $count );
		if ( 0 === $count ) {
			throw new Exception( "Class not located within a directory tree containing 'plugins': $file_name" );
		}

		// Make sure that we can reliably get the relative path inside of the content directory
		$content_dir = trailingslashit( WP_CONTENT_DIR );
		if ( '/' !== DIRECTORY_SEPARATOR ) {
			$content_dir = str_replace( DIRECTORY_SEPARATOR, '/', $content_dir ); // Windows compat
		}
		if ( 0 !== strpos( $plugin_dir, $content_dir ) ) {
			throw new Exception( 'Plugin dir is not inside of WP_CONTENT_DIR' );
		}
		$content_sub_path = substr( $plugin_dir, strlen( $content_dir ) );
		$dir_url = content_url( trailingslashit( $content_sub_path ) );
		$dir_path = $plugin_dir;
		$dir_basename = basename( $plugin_dir );
		return compact( 'dir_url', 'dir_path', 'dir_basename' );
	}

	/**
	 * Return whether we're on WordPress.com VIP production.
	 *
	 * @return bool
	 */
	public function is_wpcom_vip_prod() {
		return ( defined( '\WPCOM_IS_VIP_ENV' ) && \WPCOM_IS_VIP_ENV );
	}
}
