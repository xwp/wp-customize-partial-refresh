wp.customize.navMenusPreview = wp.customize.MenusCustomizerPreview = ( function( $, _, wp, api ) {
	'use strict';

	var self = {};

	/**
	 * Partial representing an invocation of wp_nav_menu().
	 *
	 * @class
	 * @augments wp.customize.Partial
	 * @since 4.5.0
	 */
	self.NavMenuPlacementPartial = api.Partial.extend({

		/**
		 * Constructor.
		 *
		 * @since 4.5.0
		 * @param {string} id      - Partial ID.
		 * @param {Object} options -
		 * @param {Object} options.params
		 * @param {jQuery} options.params.containerElement
		 * @param {Object} options.params.navMenuArgs
		 */
		initialize: function( id, options ) {
			var partial = this, matches;
			matches = id.match( /^nav_menu_placement\[(\d+)]$/ );
			if ( ! matches ) {
				throw new Error( 'Illegal id for nav_menu_placement partial.' );
			}

			options = options || {};
			options.params = options.params || {};
			options.params = _.extend(
				{
					containerElement: null,
					navMenuArgs: {}
				},
				options.params
			);
			api.Partial.prototype.initialize.call( partial, id, options );

			if ( ! _.isObject( partial.params.navMenuArgs ) ) {
				throw new Error( 'Missing navMenuArgs' );
			}
		},

		/**
		 * Get the containers for this partial.
		 *
		 * Since one partial is created for each single instance of a wp_nav_menu()
		 * invoked on the page, the returned array will only contain one container item.
		 *
		 * @since 4.5.0
		 * @returns {Array}
		 */
		containers: function() {
			var partial = this, container;
			container = {
				element: partial.params.containerElement,
				context: partial.params.navMenuArgs
			};
			return [ container ];
		},

		/**
		 * Return whether the setting is related to this partial.
		 *
		 * @since 4.5.0
		 * @param {wp.customize.Value|string} setting - Object or ID.
		 * @returns {boolean}
		 */
		isRelatedSetting: function( setting ) {
			var partial = this, navMenuLocationSetting, navMenuId;
			if ( _.isString( setting ) ) {
				setting = api( setting );
			}

			if ( partial.params.navMenuArgs.theme_location ) {
				if ( 'nav_menu_locations[' + partial.params.navMenuArgs.theme_location + ']' === setting.id ) {
					return true;
				}
				navMenuLocationSetting = api( 'nav_menu_locations[' + partial.params.navMenuArgs.theme_location + ']' );
			}

			navMenuId = partial.params.menu;
			if ( ! navMenuId && navMenuLocationSetting ) {
				navMenuId = navMenuLocationSetting();
			}

			if ( partial.params.navMenuArgs.menu === navMenuId ) {
				return true;
			}
			if ( navMenuId && 'nav_menu[' + navMenuId + ']' === setting.id ) {
				return true;
			}
			if ( ( /^nav_menu_item\[/.test( setting.id ) && setting().nav_menu_term_id === navMenuId ) ) {
				return true;
			}
			return false;
		}
	});

	// @todo Trigger the customize-preview-menu-refreshed (deprecated) event based on an underlying wp.customize partial-refreshed event.

	api.partialConstructor.nav_menu = self.NavMenuPlacementPartial;

	/**
	 * Connect nav menu items with their corresponding controls in the pane.
	 *
	 * Setup shift-click on nav menu items which are more granular than the nav menu partial itself.
	 * Also this applies even if a nav menu is not partial-refreshable.
	 *
	 * @since 4.5.0
	 */
	self.highlightControls = function() {
		var selector = '.menu-item[id^=menu-item-]';

		// Focus on the menu item control when shift+clicking the menu item.
		$( document ).on( 'click', selector, function( e ) {
			var navMenuItemParts;
			if ( ! e.shiftKey ) {
				return;
			}

			// @todo Re-add the title attribute for editing.

			navMenuItemParts = $( this ).attr( 'id' ).match( /^menu-item-(\d+)$/ );
			if ( navMenuItemParts ) {
				e.preventDefault();
				e.stopPropagation(); // Make sure a sub-nav menu item will get focused instead of parent items.
				api.preview.send( 'focus-nav-menu-item-control', parseInt( navMenuItemParts[1], 10 ) );
			}
		});
	};

	/**
	 * Add partials for any nav menu container elements in the document.
	 *
	 * This method may be called multiple times. Containers that already have been
	 * seen will be skipped.
	 *
	 * @since 4.5.0
	 */
	self.addPartialsForContainers = function() {
		var containerElements = $( '[data-customize-nav-menu-args]' );
		containerElements.each( function() {
			var partial, containerElement = $( this );
			if ( containerElement.data( 'customize-partial-container-added' ) ) {
				return;
			}
			partial = new self.NavMenuPlacementPartial( 'nav_menu_placement[' + String( _.uniqueId() ) + ']', {
				params: {
					containerElement: containerElement,
					navMenuArgs: containerElement.data( 'customize-nav-menu-args' )
				}
			} );
			api.partial.add( partial.id, partial );
			containerElement.data( 'customize-partial-container-added', true );
		} );
	};

	/**
	 * Watch for changes to nav_menu_locations[] settings.
	 *
	 * Refresh partials associated with the given nav_menu_locations[] setting,
	 * or request an entire preview refresh if there are no containers in the
	 * document for a partial associated with the theme location.
	 *
	 * @since 4.5.0
	 */
	self.watchNavMenuLocationChanges = function() {
		api.bind( 'change', function( setting ) {
			var themeLocation, themeLocationPartialFound = false, matches = setting.id.match( /^nav_menu_locations\[(.+)]$/ );
			if ( ! matches ) {
				return;
			}
			themeLocation = matches[1];
			api.partial.each( function( partial ) {
				if ( partial.extended( self.NavMenuPlacementPartial ) && partial.params.navMenuArgs.theme_location === themeLocation ) {
					partial.refresh();
					themeLocationPartialFound = true;
				}
			} );

			if ( ! themeLocationPartialFound ) {
				api.selectiveRefresh.requestFullRefresh();
			}
		} );
	};

	api.bind( 'preview-ready', function() {
		self.addPartialsForContainers();
		self.watchNavMenuLocationChanges();

		api.preview.bind( 'active', function() {
			self.highlightControls();
		} );
	} );

	return self;

}( jQuery, _, wp, wp.customize ) );
