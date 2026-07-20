'use strict';

const build = require('@microsoft/sp-build-web');

build.addSuppression(`Warning - [sass] The local CSS class 'ms-Grid' is not camelCase and will not be type-safe.`);

build.initialize(require('gulp'));

// Alias serve to serve-deprecated for ease of use
require('gulp').task('serve', require('gulp').task('serve-deprecated'));
