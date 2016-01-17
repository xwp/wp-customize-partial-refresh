<?php

class Test_WP_Customize_Partial_Refresh_Settings extends WP_UnitTestCase {

	/**
	 * @var WP_Customize_Manager
	 */
	public $wp_customize;

	/**
	 * @var WP_Customize_Partial_Refresh_Plugin
	 */
	public $plugin;

	/**
	 * @var WP_Customize_Partial_Refresh_Settings
	 */
	public $settings;

	function setUp() {
		parent::setUp();
		require_once( ABSPATH . WPINC . '/class-wp-customize-manager.php' );
		$GLOBALS['wp_customize'] = new WP_Customize_Manager();
		$this->wp_customize = $GLOBALS['wp_customize'];
		$this->plugin = $GLOBALS['wp_customize_partial_refresh_plugin'];
		$this->settings = new WP_Customize_Partial_Refresh_Settings( $this->plugin );
		remove_action( 'after_setup_theme', 'twentyfifteen_setup' );
	}

	function tearDown() {
		$this->wp_customize = null;
		unset( $GLOBALS['wp_customize'] );
		unset( $GLOBALS['wp_scripts'] );
		parent::tearDown();
	}

	function do_customize_boot_actions() {
		$_SERVER['REQUEST_METHOD'] = 'POST';
		do_action( 'setup_theme' );
		$_REQUEST['nonce'] = wp_create_nonce( 'preview-customize_' . $this->wp_customize->theme()->get_stylesheet() );
		do_action( 'after_setup_theme' );
		do_action( 'init' );
		do_action( 'wp_loaded' );
		do_action( 'wp', $GLOBALS['wp'] );
		$_REQUEST['wp_customize'] = 'on';
	}

	/**
	 * @see WP_Customize_Partial_Refresh_Settings::__construct()
	 */
	function test_construct() {
		$this->assertInstanceOf( 'WP_Customize_Partial_Refresh_Plugin', $this->plugin );
		$this->assertEquals( 11, has_action( 'after_setup_theme', array( $this->settings, 'init' ) ) );
	}

	/**
	 * @see WP_Customize_Partial_Refresh_Settings::init()
	 */
	function test_init_bails() {
		$this->settings->init();
		$this->assertFalse( has_action( 'customize_controls_print_footer_scripts', array( $this->settings, 'enqueue_scripts' ) ) );
	}

	/**
	 * @see WP_Customize_Partial_Refresh_Settings::init()
	 */
	function test_init() {
		$settings = new WP_Customize_Partial_Refresh_Settings( $this->plugin );
		$settings->init();
		$this->assertEquals( 10, has_action( 'customize_controls_print_footer_scripts', array( $settings, 'enqueue_scripts' ) ) );
	}

	/**
	 * @see WP_Customize_Partial_Refresh_Settings::enqueue_scripts()
	 */
	function test_enqueue_scripts() {
		$this->plugin->register_scripts( wp_scripts() );
		$this->settings->enqueue_scripts();
		$this->assertTrue( wp_script_is( $this->plugin->script_handles['settings'], 'enqueued' ) );
	}

	/**
	 * @see WP_Customize_Partial_Refresh_Settings::settings()
	 */
	function test_settings() {
		wp_set_current_user( $this->factory->user->create( array( 'role' => 'administrator' ) ) );
		$this->do_customize_boot_actions();

		$this->wp_customize->add_setting( 'foo', array(
			'default'   => 'default',
			'transport' => 'partialRefresh',
		) );
		$this->wp_customize->get_setting( 'foo' )->selector  = '.foo';
		$this->wp_customize->add_setting( 'bar', array(
			'default'   => 'default',
			'transport' => 'postMessage',
		) );
		$this->assertEquals( array( 'foo' => '.foo' ), $this->settings->settings() );
	}
}
