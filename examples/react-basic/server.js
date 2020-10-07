const React = require('react');
const ReactDOMServer = require('react-dom/server');
const { AppRegistry } = require('react-native-web');
const express = require('express');
const fs = require('fs');

// const bundledJs = fs.readFileSync('./build/static/js/main.js');

const App = require('../../dist');

const app = express();

AppRegistry.registerComponent('RecyclerGridViewDemo', () => App);
// prerender the app
const { element, getStyleElement } = AppRegistry.getApplication(
    'RecyclerGridViewDemo',
    {}
);
// first the element
const html = ReactDOMServer.renderToString(element);
// then the styles
const css = ReactDOMServer.renderToStaticMarkup(getStyleElement());

app.get('/', (req, res) => {
    res.send(`
    ${css}
    <div id="root">${html}</div>
  `);
});

app.listen(3001, () => {
    console.log('Server started');
});
