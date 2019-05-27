const _ = require('lodash');
const path = require('path');
const webpack = require('webpack');
const UglifyJSPlugin = require('uglifyjs-webpack-plugin');
const {
  BundleAnalyzerPlugin
} = require('webpack-bundle-analyzer');
const NodeExternals = require('webpack-node-externals');

module.exports = (env = {}) => {

  const _TARGET = "node";
  const __ANALYZE__ = env.analyze;
  const __DEV__ = env.development;
  const __PROD__ = env.production || __ANALYZE__;

  if (__PROD__ === __DEV__) {
    throw new Error("Production or development configuration must be selected");
  }

  let _ENV = null;
  if (__PROD__) {
    _ENV = 'production';
  }

  if (__DEV__) {
    _ENV = 'development';
  }

  /****************************************************************************/
  let entry = {};
  entry['index'] = __dirname + '/src/index.jsx';
  entry = {
    ...entry
  };


  /****************************************************************************/
  let plugins = [];

  if (__PROD__) {
    plugins.push(new UglifyJSPlugin());
  }

  if (__DEV__) {
    plugins.push(new webpack.NamedModulesPlugin());
    plugins.push(new webpack.NoEmitOnErrorsPlugin());
    plugins.push(new webpack.DefinePlugin({
      "process.env": {
        ..._.mapValues(process.env, v => JSON.stringify(v)),
        "NODE_ENV": JSON.stringify(_ENV),
        "BUILD_TARGET": JSON.stringify(_TARGET)
      }
    }));
  }

  if (__ANALYZE__) {
    plugins.push(new BundleAnalyzerPlugin());
  }

  /***************************************************************************/
  const rules = [{
    test: /\.jsx$/,
    loader: 'babel-loader',
    include: [path.resolve(__dirname, 'src')]
  }];

  /***************************************************************************/
  const node = {
    console: true,
    global: true,
    process: true,
    Buffer: true,
    __filename: "mock",
    __dirname: "mock",
    setImmediate: true,
    fs: 'empty',
    net: 'empty',
    tls: 'empty'
  };

  /***************************************************************************/
  const externals = [NodeExternals()];

  return {
    target: _TARGET,
    entry,
    output: {
      path: __dirname + '/dist',
      filename: '[name].js',
      libraryTarget: 'umd'
    },
    module: {
      rules
    },
    plugins,
    resolve: {
      modules: [
        path.resolve(__dirname, 'src'),
        'node_modules'
      ],
      extensions: ['.js', '.jsx', '.json']
    },
    devtool: (__DEV__) ? 'cheap-module-source-map' : false,
    externals,
    node
  };
}
