'use strict';
// Start w sieci firmowej (dla telefonów): nasłuch na wszystkich interfejsach. Działa tak samo na Windows i Linux.
process.env.HOST = process.env.HOST || '0.0.0.0';
require('../server/index').main();
