#!/bin/bash
cd ~/silent-giants
export NODE_OPTIONS="--experimental-modules --es-module-specifier-resolution=node"
exec node src/index.js
