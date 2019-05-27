import _ from 'lodash'
import {spawn} from '@nebulario/core-process';
import {Operation, IO} from '@nebulario/core-plugin-request';
import {sync} from './dependencies'

export const configure = async (params, cxt) => {

  const {
    configuration,
    module: {
      moduleid,
      mode,
      fullname,
      code: {
        paths: {
          absolute: {
            folder
          }
        },
        dependencies
      }
    },
    modules
  } = params;

  for (const dep of dependencies) {
    const {kind, filename, path, checkout} = dep;
    if (kind === "inner" || checkout === null) {
      continue;
    }

    if (configuration === "develop") {
      const ModInfo = _.find(modules, {moduleid: dep.moduleid});

      if (ModInfo) {
        await sync({
          module: {
            moduleid,
            code: {
              paths: {
                absolute: {
                  folder
                }
              }
            }
          },
          dependency: {
            filename,
            path,
            version: "file:./../" + dep.moduleid
          }
        }, cxt);
      }
    }

    if (configuration === "baseline") {
      if (checkout && checkout.baseline.current) {
        await sync({
          module: {
            moduleid,
            code: {
              paths: {
                absolute: {
                  folder
                }
              }
            }
          },
          dependency: {
            filename,
            path,
            version: checkout.baseline.current.version
          }
        }, cxt);
      }
    }

    if (configuration === "iteration") {
      if (checkout && checkout.iteration.current) {
        await sync({
          module: {
            moduleid,
            code: {
              paths: {
                absolute: {
                  folder
                }
              }
            }
          },
          dependency: {
            filename,
            path,
            version: checkout.iteration.current.version
          }
        }, cxt);
      }
    }

  }

  return {};
}
