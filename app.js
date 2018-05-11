var express = require('express');
var app = express();
var path = require('path');

app.use(express.static('.'));

app.listen(8080);