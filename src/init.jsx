import _ from 'lodash'
import {spawn} from '@nebulario/core-process';
import {Operation, IO} from '@nebulario/core-plugin-request';

export const init = async (params, cxt) => {

  const {
    module: {
      moduleid,
      mode,
      fullname,
      code: {
        paths: {
          absolute: {
            folder
          }
        }
      }
    },
    modules
  } = params;

  return null;
}
