/* global jQuery, _customizePartialRefreshSettings, JSON, _ */
/* exported customizePartialRefreshSettings */
var customizePartialRefreshSettings = ( function( $ ) {
	'use strict';

	var self, api = wp.customize;

	self = {
		settingSelectors: {}
	};

	$.extend( self, _customizePartialRefreshSettings );

	/*
	 * Inject the selectors into the setting objects. This will not be needed
	 * in Core because the selector would be output via WP_Customize_Setting::json().
	 */
	api.bind( 'add', function( setting ) {
		if ( self.settingSelectors[ setting.id ] ) {
			setting.selector = self.settingSelectors[ setting.id ];
		}
		if ( setting.selector ) {
			console.info(setting.selector);
			setting.bind( self.onChangeSetting );
		}
	} );

	/**
	 * Inject the functionality.
	 */
	self.init = function() {
		api.bind( 'ready', function() {
			self.request = _.debounce( self.request, api.previewer.refreshBuffer );
		} );
	};

	self._settingValuesPendingPreview = {};
	//
	//self.getSettingSelector = function( settingId ) {
	//	var setting = api( settingId );
	//	if ( setting && setting.selector ) {
	//		return;
	//	}
	//};

	/**
	 * Change event for selective settings, requests a new value.
	 */
	self.onChangeSetting = function() {
		var setting = this;
		if ( ! setting.selector ) {
			return;
		}
		self._settingValuesPendingPreview[ setting.id ] = setting.get();

		// @todo A message should be sent to the preview now indicating selective refresh has been initiated. This would allow a loading indicaor to be added.
		self.request();
		// @todo On fail, then what?
	};

	self._currentRequest = null;

	/**
	 * Preview the settings when the value changes.
	 *
	 * @todo return {jQuery.Deferred}
	 */
	self.request = function() {
		var dirtyCustomized = {}, selectiveRefreshSettingIds;

		if ( self._currentRequest ) {
			self._currentRequest.abort();
		}

		selectiveRefreshSettingIds = _.keys( self._settingValuesPendingPreview );
		_.extend( dirtyCustomized, self._settingValuesPendingPreview );
		api.each( function( setting, key ) {
			if ( setting._dirty ) {
				dirtyCustomized[ key ] = setting();
			}
			if ( setting.selector ) {
				selectiveRefreshSettingIds.push( setting.id );
			}
		} );

		self._currentRequest = wp.ajax.post( self.action, {
			nonce: self.nonce,
			wp_customize: 'on',
			setting_ids: _.uniq( selectiveRefreshSettingIds ),
			customized: JSON.stringify( dirtyCustomized )
		} );

		self._currentRequest.done( function( response ) {
			_.each( response, function( result, settingId ) {
				var setting = api( settingId );

				if ( ! _.isObject( result ) || ( _.isUndefined( result.data ) && _.isUndefined( result.error ) ) ) {
					throw new Error( 'selective_refresh_response_not_array_of_objects' );
				}

				// Skip settings that are now deleted or which no longer have associated selectors.
				if ( ! setting || ! setting.selector ) {
					return;
				}

				if ( result.error ) {

					// @todo Show validation message?
					api.previewer.refresh();
				} else {
					api.previewer.send( 'selective-refresh', settingId, setting.selector, result.data );
				}
			} );

			// Reset the settings' pending values to preview.
			self._settingValuesPendingPreview = {};
		} );

		self._currentRequest.fail( function() {
			api.previewer.refresh();
		} );
	};

	self.init();

	return self;
}( jQuery ) );
