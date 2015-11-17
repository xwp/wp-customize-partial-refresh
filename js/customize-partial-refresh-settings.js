/* global jQuery, _customizePartialRefreshSettings, JSON, _ */
/* exported customizePartialRefreshSettings */
var customizePartialRefreshSettings = ( function( $ ) {
	'use strict';

	var self, api = wp.customize;

	self = {
		setting: null
	};

	$.extend( self, _customizePartialRefreshSettings );

	/**
	 * Inject the functionality.
	 */
	self.init = function() {
		api.bind( 'ready', function() {
			self.onChangeSetting();
		} );

		api.bind( 'setting-partial', function( response ) {
			var that = $( 'iframe' ).contents(),
				value = $.trim( response );

			$( self.setting.selector, that ).html( value );
		} );
	};

	/**
	 * Change event for selective settings, requests a new value.
	 */
	self.onChangeSetting = function() {
		$.each( self.settings, function( id, selector ) {

			api( id, function( setting ) {

				setting.bind( function() {
					self.setting = {
						id: id,
						selector: selector
					};
					self.request();
				} );
			} );
		} );
	};

	/**
	 * Request a new setting value.
	 *
	 * @return {jQuery.Deferred}
	 */
	self.request = function() {
		var spinner = $( '#customize-header-actions .spinner' ),
			active = 'is-active',
			deferred = $.Deferred(),
			req = self.debounceRequest();

		spinner.addClass( active );

		req.done( function( response ) {
			deferred.resolve();
			api.trigger( 'setting-partial', response );
			spinner.removeClass( active );
		} );

		req.fail( function() {
			deferred.reject.apply( deferred, arguments );
			api.previewer.refresh();
			spinner.removeClass( active );
		} );

		return deferred;
	};

	/**
	 * Debounce the requests, allowing setting changes made back-to-back to be sent together.
	 *
	 * @return {jQuery.Deferred}
	 */
	self.debounceRequest = ( function() {
		var request, debouncedDeferreds = [];

		request = _.debounce( function() {
			var req, dirtyCustomized = {};

			api.each( function( value, key ) {
				if ( value._dirty ) {
					dirtyCustomized[ key ] = value();
				}
			} );

			req = wp.ajax.post( self.action, {
				nonce: self.nonce,
				setting_id: self.setting.id,
				wp_customize: 'on',
				customized: JSON.stringify( dirtyCustomized )
			} );

			req.done( function() {
				var deferred;
				while ( debouncedDeferreds.length ) {
					deferred = debouncedDeferreds.shift();
					deferred.resolveWith( req, arguments );
				}
			} );

			req.fail( function() {
				var deferred;
				while ( debouncedDeferreds.length ) {
					deferred = debouncedDeferreds.shift();
					deferred.rejectWith( req, arguments );
				}
			} );

		} );

		return function() {
			var deferred = $.Deferred();
			debouncedDeferreds.push( deferred );
			request();
			return deferred;
		};
	}() );

	self.init();
}( jQuery ) );
