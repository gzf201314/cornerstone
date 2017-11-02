import { getLayers, getActiveLayer, getVisibleLayers } from '../layers.js';
import { addColorLayer } from '../rendering/renderColorImage.js';
import { addGrayscaleLayer } from '../rendering/renderGrayscaleImage.js';
import { addPseudoColorLayer } from '../rendering/renderPseudoColorImage';
import setToPixelCoordinateSystem from '../setToPixelCoordinateSystem.js';
import cloneViewportPositionParameters from './cloneViewportPositionParameters.js';
// This is used to keep each of the layers' viewports in sync with the active layer
const syncedViewports = {};

// Sync all viewports based on active layer's viewport
function syncViewports (layers, activeLayer) {
  // If we intend to keep the viewport's scale, translation and rotation in sync,
  // loop through the layers
  layers.forEach((layer) => {
    // Don't do anything to the active layer
    if (layer === activeLayer) {
      return;
    }

    const activeLayerSyncedViewport = syncedViewports[activeLayer.layerId] || activeLayer.viewport;
    const currentLayerSyncedViewport = syncedViewports[layer.layerId] || layer.viewport;
    const viewportRatio = currentLayerSyncedViewport.scale / activeLayerSyncedViewport.scale;

    // Update the layer's translation and scale to keep them in sync with the first image
    // based on the ratios between the images
    layer.viewport.scale = activeLayer.viewport.scale * viewportRatio;
    layer.viewport.rotation = activeLayer.viewport.rotation;
    layer.viewport.translation = {
      x: (activeLayer.viewport.translation.x / viewportRatio),
      y: (activeLayer.viewport.translation.y / viewportRatio)
    };
    layer.viewport.hflip = activeLayer.viewport.hflip;
    layer.viewport.vflip = activeLayer.viewport.vflip;
  });
}

/**
 * Internal function to render all layers for a Cornerstone enabled element
 *
 * @param {CanvasRenderingContext2D} context Canvas context to draw upon
 * @param {EnabledElementLayer[]} layers The array of all layers for this enabled element
 * @param {Boolean} invalidated A boolean whether or not this image has been invalidated and must be redrawn
 * @returns {void}
 */
function renderLayers (context, layers, invalidated) {
  // Loop through each layer and draw it to the canvas
  layers.forEach((layer) => {
    if (!layer.image) {
      return;
    }

    context.save();

    // Set the layer's canvas to the pixel coordinate system
    layer.canvas = context.canvas;
    setToPixelCoordinateSystem(layer, context);

    // Render into the layer's canvas
    if (layer.viewport.colormap || layer.options.colormap) {
      addPseudoColorLayer(layer, invalidated);
    } else if (layer.image.color === true) {
      addColorLayer(layer, invalidated);
    } else {
      addGrayscaleLayer(layer, invalidated);
    }

    // Apply any global opacity settings that have been defined for this layer
    if (layer.options && layer.options.opacity) {
      context.globalAlpha = layer.options.opacity;
    } else {
      context.globalAlpha = 1;
    }

    if (layer.options && layer.options.fillStyle) {
      context.fillStyle = layer.options.fillStyle;
    }

    // Set the pixelReplication property before drawing from the layer into the
    // composite canvas
    context.imageSmoothingEnabled = !layer.viewport.pixelReplication;
    context.mozImageSmoothingEnabled = context.imageSmoothingEnabled;

    // Draw from the current layer's canvas onto the enabled element's canvas
    const { width, height } = layer.image;

    context.drawImage(layer.canvas, 0, 0, width, height, 0, 0, width, height);
    context.restore();
  });
}

/**
 * Internal API function to draw a composite image to a given enabled element
 *
 * @param {EnabledElement} enabledElement An enabled element to draw into
 * @param {Boolean} invalidated - true if pixel data has been invalidated and cached rendering should not be used
 * @returns {void}
 */
export default function (enabledElement, invalidated) {
  const element = enabledElement.element;
  const allLayers = getLayers(element);
  const activeLayer = getActiveLayer(element);
  const visibleLayers = getVisibleLayers(element);
  const resynced = !enabledElement.lastSyncViewportsState && enabledElement.syncViewports;

  // This state will help us to determine if the user has re-synced the
  // layers allowing us to make a new copy of the viewports
  enabledElement.lastSyncViewportsState = enabledElement.syncViewports;

  // Stores a copy of all viewports if the user has just synced them then we can use the
  // copies to calculate anything later (ratio, translation offset, rotation offset, etc)
  if (resynced) {
    allLayers.forEach(function (layer) {
      syncedViewports[layer.layerId] = cloneViewportPositionParameters(layer.viewport);
    });
  }

  // Sync all viewports in case it's activated
  if (enabledElement.syncViewports === true) {
    syncViewports(visibleLayers, activeLayer);
  }

  // Get the enabled element's canvas so we can draw to it
  const context = enabledElement.canvas.getContext('2d');

  context.setTransform(1, 0, 0, 1, 0, 0);

  // Clear the canvas
  context.fillStyle = 'black';
  context.fillRect(0, 0, enabledElement.canvas.width, enabledElement.canvas.height);

  // Render all visible layers
  renderLayers(context, visibleLayers, invalidated);
}
