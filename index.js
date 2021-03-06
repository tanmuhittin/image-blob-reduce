
'use strict';

var jpeg_plugins = require('./lib/jpeg_plugins');


function ImageBlobReduce(options) {
  if (!(this instanceof ImageBlobReduce)) return new ImageBlobReduce(options);

  options = options || {};
  this.pica = options.pica || require('pica')();
  this.initialized = false;
}


ImageBlobReduce.prototype.init = function () {
  this.before('_blob_to_image', jpeg_plugins.jpeg_patch_exif);
  this.after('_transform',      jpeg_plugins.jpeg_rotate_canvas);
  this.after('_create_blob',    jpeg_plugins.jpeg_attach_orig_segments);
};


ImageBlobReduce.prototype.to_blob = function (blob, options) {
  options = options || {};

  var _env = { blob: blob, max: options.max || Infinity, pica: this.pica };

  if (!this.initialized) {
    this.init();
    this.initialized = true;
  }

  return Promise.resolve(_env)
    .then(this._blob_to_image)
    .then(this._transform)
    .then(this._cleanup)
    .then(this._create_blob)
    .then(function (env) { return env.out_blob; });
};


ImageBlobReduce.prototype.to_canvas = function (blob, options) {
  options = options || {};

  var _env = { blob: blob, max: options.max || Infinity, pica: this.pica };

  if (!this.initialized) {
    this.init();
    this.initialized = true;
  }

  return Promise.resolve(_env)
    .then(this._blob_to_image)
    .then(this._transform)
    .then(this._cleanup)
    .then(function (env) { return env.out_canvas; });
};


ImageBlobReduce.prototype.before = function (method_name, fn) {
  if (!this[method_name]) throw new Error('Method "' + method_name + '" does not exist');
  if (typeof fn !== 'function') throw new Error('Invalid argument "fn", function expected');

  var old_fn = this[method_name];
  var self = this;

  this[method_name] = function (env) {
    return fn.call(self, env).then(function (_env) {
      return old_fn.call(self, _env);
    });
  };

  return this;
};


ImageBlobReduce.prototype.after = function (method_name, fn) {
  if (!this[method_name]) throw new Error('Method "' + method_name + '" does not exist');
  if (typeof fn !== 'function') throw new Error('Invalid argument "fn", function expected');

  var old_fn = this[method_name];
  var self = this;

  this[method_name] = function (env) {
    return old_fn.call(self, env).then(function (_env) {
      return fn.call(self, _env);
    });
  };

  return this;
};


ImageBlobReduce.prototype._blob_to_image = function (env) {
  var URL = window.URL || window.webkitURL || window.mozURL || window.msURL;

  env.image = document.createElement('img');
  env.image_url = URL.createObjectURL(env.blob);
  env.image.src = env.image_url;

  return new Promise(function (resolve, reject) {
    env.image.onerror = function () { reject(new Error('ImageBlobReduce: failed to create Image() from blob')); };
    env.image.onload = function () { resolve(env); };
  });
};


ImageBlobReduce.prototype._transform = function (env) {
  var scale_factor = env.max / Math.max(env.image.width, env.image.height);

  if (scale_factor > 1) scale_factor = 1;

  var out_width = Math.max(Math.round(env.image.width * scale_factor), 1);
  var out_height = Math.max(Math.round(env.image.height * scale_factor), 1);

  env.out_canvas = document.createElement('canvas');
  env.out_canvas.width = out_width;
  env.out_canvas.height = out_height;

  return env.pica.resize(env.image, env.out_canvas, { alpha: env.blob.type === 'image/png' })
    .then(function () { return env; });
};


ImageBlobReduce.prototype._cleanup = function (env) {
  env.image.src = '';
  env.image = null;

  var URL = window.URL || window.webkitURL || window.mozURL || window.msURL;
  if (URL.revokeObjectURL) URL.revokeObjectURL(env.image_url);

  env.image_url = null;

  return Promise.resolve(env);
};


ImageBlobReduce.prototype._create_blob = function (env) {
  return env.pica.toBlob(env.out_canvas, env.blob.type)
    .then(function (blob) {
      env.out_blob = blob;
      return env;
    });
};


ImageBlobReduce.prototype._getUint8Array = function (blob) {
  if (blob.arrayBuffer) {
    return blob.arrayBuffer().then(function (buf) {
      return new Uint8Array(buf);
    });
  }

  return new Promise(function (resolve, reject) {
    var fr = new FileReader();

    fr.readAsArrayBuffer(blob);

    fr.onload = function () { resolve(new Uint8Array(fr.result)); };
    fr.onerror = function () {
      reject(new Error('ImageBlobReduce: failed to load data from input blob'));
      fr.abort();
    };
    fr.onabort = function () {
      reject(new Error('ImageBlobReduce: failed to load data from input blob (aborted)'));
    };
  });
};


module.exports = ImageBlobReduce;
module.exports.pica = require('pica');
