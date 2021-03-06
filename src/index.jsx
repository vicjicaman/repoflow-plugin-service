import {IO, Plugin} from '@nebulario/core-plugin-request';

import * as Dependencies from './dependencies';
import * as Build from './build';
import * as Run from './run';
import {publish} from './publish';

(async () => {

  await Plugin.run("service", {
    dependencies: {
      list: Dependencies.list,
      sync: Dependencies.sync
    },
    run: {
      listen: Run.listen,
      init: Run.init,
      clear: Run.clear,
      start: Run.start
    },
    build: {
      clear: Build.clear,
      init: Build.init,
      start: Build.start
    },
    publish
  });

})().catch(e => {
  IO.sendEvent("plugin.fatal", {data: e.message});
  throw e;
});
