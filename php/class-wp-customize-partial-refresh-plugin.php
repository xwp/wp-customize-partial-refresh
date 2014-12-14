<?php

class WP_Customize_Partial_Refresh_Plugin {

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
	 * Plugin bootstrap for Partial Refresh functionality.
	 */
	function __construct() {
		$plugin_location = $this->locate_plugin();
		$this->dir_path = $plugin_location['dir_path'];
		$this->dir_url = $plugin_location['dir_url'];
		$this->config = array();

		if ( did_action( 'plugins_loaded' ) ) {
			$init_action = 'after_setup_theme'; // for WordPress VIP
		} else {
			$init_action = 'init';
		}

		add_action( $init_action, array( $this, 'init' ) );
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
	 * Version of plugin_dir_url() which works for plugins installed in the plugins directory,
	 * and for plugins bundled with themes.
	 *
	 * @throws Exception
	 * @return array
	 */
	public function locate_plugin() {
		$reflection = new ReflectionObject( $this );
		$file_name = $reflection->getFileName();
		$dir_path = preg_replace( '#(.*plugins[^/]*/[^/]+)(/.*)?#', '$1', $file_name, 1, $count );
		if ( 0 === $count ) {
			throw new Exception( "Class not located within a directory tree containing 'plugins': $file_name" );
		}

		// Make sure that we can reliably get the relative path inside of the content directory
		$content_dir = trailingslashit( WP_CONTENT_DIR );
		if ( 0 !== strpos( $dir_path, $content_dir ) ) {
			throw new Exception( 'Plugin dir is not inside of WP_CONTENT_DIR' );
		}
		$content_sub_path = substr( $dir_path, strlen( $content_dir ) );
		$dir_url = content_url( trailingslashit( $content_sub_path ) );
		return compact( 'dir_url', 'dir_path' );
	}
}
