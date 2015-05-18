/*global jQuery, JSON, _wpCustomizePartialRefreshMenusExports, _ */

if ( ! wp.customize.partialPreviewMenus ) {
	wp.customize.partialPreviewMenus = {};
}

wp.customize.partialPreviewMenus.preview = ( function ( $ ) {
	'use strict';
	var self;

	self = {
		renderQueryVar: null,
		renderNonceValue: null,
		renderNoncePostKey: null,
		previewCustomizeNonce: null,
		previewReady: $.Deferred(),
		registeredSidebars: {},
		requestUri: '/',
		theme: {
			active: false,
			stylesheet: ''
		},
		navMenuInstanceArgs: {}
	};

	wp.customize.bind( 'preview-ready', function () {
		self.previewReady.resolve();
	} );
	self.previewReady.done( function () {
		self.init();
	} );

	/**
	 * Bootstrap functionality.
	 */
	self.init = function () {
		var self = this;

		if ( 'undefined' !== typeof _wpCustomizePartialRefreshMenusExports ) {
			$.extend( self, _wpCustomizePartialRefreshMenusExports );
		}

		// Improve lookup of registered sidebars via map of sidebar ID to sidebar object
		_.each( wp.customize.WidgetCustomizerPreview.registeredSidebars, function ( sidebar ) {
			self.registeredSidebars[ sidebar.id ] = sidebar;
		} );

		self.previewReady.done( function () {
			wp.customize.preview.bind( 'setting', function( args ) {
				var id, value, matches;
				args = args.slice();
				id = args.shift();
				value = args.shift();
				if ( ! wp.customize.has( id ) ) {
					// Currently customize-preview.js is not creating settings for dynamically-created settings in the pane; so we have to do it
					wp.customize.create( id, value ); // @todo This should be in core
				}

				// Note we can't do wp.customize.bind( 'change', function( setting ) {...} ) because setting.id is undefined in the preview
				matches = id.match( /^nav_menu_(\d+)$/ ) || id.match( /^nav_menus\[(\d+)]/ );
				if ( matches ) {
					self.refreshMenu( parseInt( matches[1], 10 ) );
				}
			} );
		} );
	};

	/**
	 * Update a given menu rendered in the preview.
	 *
	 * @param {int} menuId
	 */
	self.refreshMenu = function( menuId ) {
		var self = this;

		_.each( self.navMenuInstanceArgs, function ( navMenuArgs, instanceNumber ) {
			if ( menuId === navMenuArgs.menu ) {
				self.refreshMenuInstance( instanceNumber );
			}
		} );

	};

	/**
	 * Update a specific instance of a given menu on the page.
	 *
	 * @param {int} instanceNumber
	 */
	self.refreshMenuInstance = function ( instanceNumber ) {
		var self = this, data, customized, container, request, wpNavArgs;

		if ( ! self.navMenuInstanceArgs[ instanceNumber ] ) {
			throw new Error( 'unknown_instance_number' );
		}

		container = $( '#partial-refresh-menu-container-' + String( instanceNumber ) );

		data = {
			nonce: self.previewCustomizeNonce, // for Customize Preview
			wp_customize: 'on'
		};
		if ( ! self.theme.active ) {
			data.theme = self.theme.stylesheet;
		}
		data[ self.renderQueryVar ] = '1';
		customized = {};
		wp.customize.each( function( setting, id ) {
			if ( /^nav_menu/.test( id ) ) {
				customized[ id ] = setting.get();
			}
		} );
		data.customized = JSON.stringify( customized );
		data[ self.renderNoncePostKey ] = self.renderNonceValue;

		wpNavArgs = $.extend( {}, self.navMenuInstanceArgs[ instanceNumber ] );
		data.wp_nav_menu_args_hash = wpNavArgs.args_hash;
		delete wpNavArgs.args_hash;
		data.wp_nav_menu_args = JSON.stringify( wpNavArgs );

		// @todo Allow plugins to prevent a partial refresh via jQuery event like for widgets? Fallback to self.preview.send( 'refresh' );

		container.addClass( 'customize-partial-refreshing' );

		request = wp.ajax.send( null, {
			data: data,
			url: self.requestUri
		} );
		request.done( function( data ) {
			container.empty().append( $( data ) );
		} );
		request.fail( function() {
			// @todo provide some indication for why
		} );
		request.always( function() {
			container.removeClass( 'customize-partial-refreshing' );
		} );
	};

	return self;
}( jQuery ));

