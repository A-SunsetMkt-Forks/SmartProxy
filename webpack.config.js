const path = require('path');
const TerserPlugin = require('terser-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const CleanWebpackPlugin = require('clean-webpack-plugin');

if (process.env.NODE_ENV == null) {
  process.env.NODE_ENV = 'development';
}
const ENV = process.env.ENV = process.env.NODE_ENV;

let plugins = [
  new CleanWebpackPlugin([
    path.resolve(__dirname, 'build/*'),
  ]),
  new CopyWebpackPlugin([
    { from: './src/_locales', to: '_locales' },
    { from: './src/icons', to: 'icons' },
    { from: './src/ui', to: 'ui', ignore: ['code/*'] },
  ]),
];

module.exports = function (args) {

  let browserType = args["browser"] || "chrome";
  plugins.push(new CopyWebpackPlugin([{ from: `./src/manifest-${browserType}.json`, to: 'manifest.json' }]));

  return {
    mode: ENV,
    entry: {
      'core': './src/core/Core.ts',
      'ui/code/popup': './src/ui/code/popup.ts',
      'ui/code/settings': './src/ui/code/settings.ts',
    },
    devtool: '',
    // devtool: 'inline-source-map',
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: 'ts-loader',
          exclude: /node_modules/
        }
      ]
    },
    resolve: {
      extensions: ['.ts', '.js']
    },
    output: {
      filename: '[name].js',
      path: path.resolve(__dirname, 'build'),
    },
    optimization: {
      minimize: false
    },
    plugins: plugins
  }
};