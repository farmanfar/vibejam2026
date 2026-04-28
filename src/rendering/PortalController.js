/**
 * PortalController — Phaser 4 filter controller for the FilterPortal render node.
 *
 * Usage:
 *   sprite.enableFilters();
 *   const ctrl = new PortalController(sprite.filterCamera);
 *   sprite.filters.internal.add(ctrl);
 *
 * Pass sprite.filterCamera (not the sprite) to the constructor — same rule as
 * OutlineController. See node_modules/phaser/src/filters/Controller.js.
 *
 * Call ctrl.advance(deltaMs) each frame to animate the swirl.
 */

import { Filters } from 'phaser';

const PhaserController = Filters.Controller;

function PortalController(camera) {
  PhaserController.call(this, camera, 'FilterPortal');

  /** Elapsed time in seconds — drives swirl/sparkle animation. */
  this.time      = 0;
  /** Brightness multiplier. 1.0 = idle, ~1.4 on hover. Tweenable. */
  this.intensity = 1.0;
}

PortalController.prototype = Object.create(PhaserController.prototype);
PortalController.prototype.constructor = PortalController;

/**
 * @param {number} deltaMs — frame delta in milliseconds
 */
PortalController.prototype.advance = function (deltaMs) {
  this.time += deltaMs * 0.001;
};

export { PortalController };
