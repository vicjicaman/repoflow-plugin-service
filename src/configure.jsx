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

  return {};
}
