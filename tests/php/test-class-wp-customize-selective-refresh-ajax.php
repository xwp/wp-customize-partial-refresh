<?php
/**
 * WP_Customize_Selective_Refresh Ajax tests.
 *
 * @package    WordPress
 * @subpackage UnitTests
 * @since      4.5.0
 * @group      ajax
 */

/**
 * Tests for the WP_Customize_Selective_Refresh class Ajax.
 *
 * Note that this is intentionally not extending WP_Ajax_UnitTestCase because it
 * is not admin ajax.
 */
class Test_WP_Customize_Selective_Refresh_Ajax extends WP_UnitTestCase {

	/**
	 * Manager.
	 *
	 * @var WP_Customize_Manager
	 */
	public $wp_customize;

	/**
	 * Component.
	 *
	 * @var WP_Customize_Selective_Refresh
	 */
	public $selective_refresh;

	/**
	 * Set up the test fixture.
	 */
	function setUp() {
		parent::setUp();

		// Define DOING_AJAX so that wp_die() will be used instead of die().
		if ( ! defined( 'DOING_AJAX' ) ) {
			define( 'DOING_AJAX', true );
		}
		add_filter( 'wp_die_ajax_handler', array( $this, 'get_wp_die_handler' ), 1, 1 );

		require_once( ABSPATH . WPINC . '/class-wp-customize-manager.php' );
		// @codingStandardsIgnoreStart
		$GLOBALS['wp_customize'] = new WP_Customize_Manager();
		// @codingStandardsIgnoreEnd
		$this->wp_customize = $GLOBALS['wp_customize'];
		if ( isset( $this->wp_customize->selective_refresh ) ) {
			$this->selective_refresh = $this->wp_customize->selective_refresh;
		}

	}

	/**
	 * Do Customizer boot actions.
	 */
	function do_customize_boot_actions() {
		// Remove actions that call add_theme_support( 'title-tag' ).
		remove_action( 'after_setup_theme', 'twentyfifteen_setup' );
		remove_action( 'after_setup_theme', 'twentysixteen_setup' );

		$_SERVER['REQUEST_METHOD'] = 'POST';
		do_action( 'setup_theme' );
		do_action( 'after_setup_theme' );
		do_action( 'init' );
		do_action( 'customize_register', $this->wp_customize );
		$this->wp_customize->customize_preview_init();
		do_action( 'wp', $GLOBALS['wp'] );
	}

	/**
	 * Test WP_Customize_Selective_Refresh::handle_render_partials_request().
	 *
	 * @see WP_Customize_Selective_Refresh::handle_render_partials_request()
	 */
	function test_handle_render_partials_request_for_unauthenticated_user() {
		$_POST[ WP_Customize_Selective_Refresh::RENDER_QUERY_VAR ] = '1';

		// Check current_user_cannot_customize.
		ob_start();
		try {
			$this->selective_refresh->handle_render_partials_request();
		} catch ( WPDieException $e ) {
			unset( $e );
		}
		$output = json_decode( ob_get_clean(), true );
		$this->assertFalse( $output['success'] );
		$this->assertEquals( 'expected_customize_preview', $output['data'] );

		// Check expected_customize_preview.
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'administrator' ) ) );
		$_REQUEST['nonce'] = wp_create_nonce( 'preview-customize_' . $this->wp_customize->theme()->get_stylesheet() );
		ob_start();
		try {
			$this->selective_refresh->handle_render_partials_request();
		} catch ( WPDieException $e ) {
			unset( $e );
		}
		$output = json_decode( ob_get_clean(), true );
		$this->assertFalse( $output['success'] );
		$this->assertEquals( 'expected_customize_preview', $output['data'] );

		// Check missing_partials.
		$this->do_customize_boot_actions();
		ob_start();
		try {
			$this->selective_refresh->handle_render_partials_request();
		} catch ( WPDieException $e ) {
			unset( $e );
		}
		$output = json_decode( ob_get_clean(), true );
		$this->assertFalse( $output['success'] );
		$this->assertEquals( 'missing_partials', $output['data'] );

		// Check missing_partials.
		$_POST['partials'] = 'bad';
		$this->do_customize_boot_actions();
		ob_start();
		try {
			$this->selective_refresh->handle_render_partials_request();
		} catch ( WPDieException $e ) {
			unset( $e );
		}
		$output = json_decode( ob_get_clean(), true );
		$this->assertFalse( $output['success'] );
		$this->assertEquals( 'malformed_partials', $output['data'] );
	}

	/**
	 * Tear down.
	 */
	function tearDown() {
		$this->wp_customize = null;
		unset( $GLOBALS['wp_customize'] );
		unset( $GLOBALS['wp_scripts'] );
		parent::tearDown();
	}
}
