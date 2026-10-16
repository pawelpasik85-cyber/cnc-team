'use strict';
// Start w sieci firmowej (dla innych komputerów stacjonarnych): nasłuch na wszystkich interfejsach. Windows i Linux.
process.env.HOST = process.env.HOST || '0.0.0.0';
require('../server/index').main();
