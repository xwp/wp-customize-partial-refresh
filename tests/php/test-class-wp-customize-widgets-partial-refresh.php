<?php
/**
 * WP_Customize_Widgets_Partial_Refresh tests.
 *
 * @package WordPress
 */

/**
 * Tests for the WP_Customize_Widgets_Partial_Refresh class.
 *
 * @group customize
 */
class Test_WP_Customize_Widgets_Partial_Refresh extends WP_UnitTestCase {

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
	 * Test WP_Customize_Widgets_Partial_Refresh::__construct().
	 *
	 * @see WP_Customize_Widgets_Partial_Refresh::__construct()
	 */
	function test_construct() {
		$this->markTestIncomplete();
	}

	/**
	 * Tear down.
	 */
	function tearDown() {
		$this->wp_customize = null;
		unset( $GLOBALS['wp_customize'] );
		parent::tearDown();
	}
}
