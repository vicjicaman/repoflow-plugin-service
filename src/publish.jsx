import {
  Publish
} from '@nebulario/core-plugin-request';

export const publish = async (params, cxt) => {
  return await Publish.publish('http://localhost:8000/build', params, cxt);
}
