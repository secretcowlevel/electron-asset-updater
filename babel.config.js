module.exports = function (api) {
  api.cache(true)

  return {
    presets: [
      [
        '@babel/preset-env',
        {
          targets: {
            node: 'current',
            chrome: '69'
          }
        }
      ]
    ],
    plugins: [
      '@babel/plugin-proposal-object-rest-spread'
    ]
  }
}
