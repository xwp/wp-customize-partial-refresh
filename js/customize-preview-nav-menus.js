wp.customize.MenusCustomizerPreview = ( function( $, _, wp, api ) {
	'use strict';

	var self = {};

	self.NavMenuPartial = api.Partial.extend({

		defaults: {
			selector: '[data-nav-menu-container=true]',
			settings: [],
			primarySetting: null
		},

		initialize: function() {
			var partial = this, matches;
			api.Partial.prototype.initialize.apply( partial, arguments );
			matches = partial.id.match( /^nav_menu\[(-?\d+)]$/ );
			if ( ! matches ) {
				throw new Error( 'Illegal id for nav_menu partial.' );
			}
			partial.navMenuId = parseInt( matches[1], 10 );
		},

		// @todo override showControl() behavior so that nav menu items will get focused instead?

		/**
		 * Get a mapping of nav menu locations to nav menu IDs.
		 *
		 * @todo This can be cached until a nav_menu_location setting changes, is added or removed. This can be a helper method in the namespace.
		 *
		 * @returns {object}
		 */
		getNavMenuLocations: function() {
			var navMenuLocations = {};
			api.each( function( setting ) {
				var matches = setting.id.match( /^nav_menu_locations\[(.+)]/ );
				if ( matches ) {
					navMenuLocations[ matches[1] ] = setting();
				}
			} );
			return navMenuLocations;
		},

		containers: function() {
			var partial = this, containers, navMenuLocations;
			containers = api.Partial.prototype.containers.call( partial );
			navMenuLocations = partial.getNavMenuLocations();

			containers = _.filter( containers, function( container ) {
				var navMenuArgs = container.context;
				return (
					( partial.navMenuId === navMenuArgs.menu_id || partial.navMenuId === navMenuArgs.menu ) ||
					( navMenuLocations[ navMenuArgs.theme_location ] === partial.navMenuId )
				);
			} );
			return containers;
		},

		isRelatedSetting: function( setting ) {
			var partial = this, value;
			if ( _.isString( setting ) ) {
				setting = api( setting );
			}
			if ( -1 !== _.indexOf( partial.settings(), setting.id ) ) {
				return true;
			}
			value = setting();
			if ( /^nav_menu_item\[/.test( setting.id ) && value.nav_menu_term_id === partial.navMenuId ) {
				return true;
			}
			if ( /^nav_menu_locations\[/.test( setting.id ) && value === partial.navMenuId ) {
				return true;
			}
			return false;
		}
	});

	// @todo Trigger the customize-preview-menu-refreshed (deprecated) event based on an underlying wp.customize partial-refreshed event.
	// @todo Handle the clearing out of a nav_menu_location. We need to add listeners to all nav_menu_location settings, and trigger partial refreshes for the nav menu formerly assigned.

	api.partialConstructor.nav_menu = self.NavMenuPartial;

	/**
	 * Connect nav menu items with their corresponding controls in the pane.
	 *
	 * Setup shift-click on nav menu items which are more granular than the nav menu partial itself.
	 */
	self.highlightControls = function() {
		var selector = '.menu-item[id^=menu-item-]';

		// Focus on the menu item control when shift+clicking the menu item.
		$( document ).on( 'click', selector, function( e ) {
			var navMenuItemParts;
			if ( ! e.shiftKey ) {
				return;
			}

			navMenuItemParts = $( this ).attr( 'id' ).match( /^menu-item-(\d+)$/ );
			if ( navMenuItemParts ) {
				e.preventDefault();
				e.stopPropagation(); // Make sure a sub-nav menu item will get focused instead of parent items.
				api.preview.send( 'focus-nav-menu-item-control', parseInt( navMenuItemParts[1], 10 ) );
			}
		});
	};

	// Add partials for any nav_menu setting created.
	api.bind( 'add', function( setting ) {
		var partial;
		if ( /^nav_menu\[/.test( setting.id ) ) {
			partial = new self.NavMenuPartial( setting.id, {
				settings: [ setting.id ]
			} );
			api.partial.add( partial.id, partial );
		}
	} );

	// Remove paritals for any nav_menu settings removed.
	api.bind( 'remove', function( setting ) {
		if ( /^nav_menu\[/.test( setting.id ) ) {
			api.partial.remove( setting.id );
		}
	} );

	api.bind( 'preview-ready', function() {
		api.preview.bind( 'active', function() {
			self.highlightControls();
		} );
	} );

	return self;

}( jQuery, _, wp, wp.customize ) );
