const { parseUri } = require('mysql2/lib/parsers/uri_parser');
const uri = "mysql://user:pass%23word@localhost:3306/db";
console.log(parseUri(uri));
