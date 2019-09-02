import fs from 'fs';
import _ from 'lodash';
import path from 'path';
//import YAML from 'yamljs'
import {
  Operation,
  IO
} from '@nebulario/core-plugin-request';
import * as Config from '@nebulario/core-config';
import * as JsonUtils from '@nebulario/core-json'


export const list = async ({
  module: {
    fullname,
    code: {
      paths: {
        absolute: {
          folder
        }
      }
    }
  }
}, cxt) => {
  const dependencies = [{
    dependencyid: 'inner|service.yaml|version',
    kind: "dependency",
    filename: "service.yaml",
    path: "version",
    fullname: "test",
    version: "1.0.1"
  }];


  {
    const service = JsonUtils.load(folder + "/dist/service.yaml", true);

    const versionPath = "metadata.labels.version"
    const version = _.get(service, versionPath);

    dependencies.push({
      dependencyid: 'inner|service.yaml|' + versionPath,
      kind: "inner",
      filename: "service.yaml",
      path: versionPath,
      fullname: fullname,
      version
    });
  } {
    const deployment = JsonUtils.load(folder + "/dist/deployment.yaml", true);

    const versionPath = "metadata.labels.version";
    const version = _.get(deployment, versionPath);

    dependencies.push({
      dependencyid: 'inner|deployment.yaml|' + versionPath,
      kind: "inner",
      filename: "deployment.yaml",
      path: versionPath,
      fullname: fullname,
      version
    });

    for (const contidx in deployment.spec.template.spec.containers) {
      const {
        image
      } = deployment.spec.template.spec.containers[contidx];
      const [cntFullname, cntVersion] = image.split(":");

      const contVerPath = "spec.template.spec.containers|" + contidx + "|(?:.+):(.+)";
      dependencies.push({
        dependencyid: 'dependency|deployment.yaml|' + contVerPath,
        kind: "container",
        filename: "deployment.yaml",
        path: contVerPath,
        fullname: cntFullname,
        version: cntVersion
      });
    }
  }

  return [...dependencies, ...Config.dependencies(folder)];
}

export const sync = async ({
  module: {
    code: {
      paths: {
        absolute: {
          folder
        }
      }
    }
  },
  dependency: {
    kind,
    filename,
    path,
    version
  }
}, cxt) => {

  if (kind === "container") {
    const containerPathSetter = (native, pathToVersion, version) => {
      const [pathCnt, idx, regexVer] = pathToVersion.split("|");

      const containers = _.get(native, pathCnt);
      const cnt = containers[parseInt(idx)];

      const versionRegex = new RegExp(regexVer);
      const versionMatch = versionRegex.exec(cnt.image);


      if (versionMatch) {
        const syncFullmatch = versionMatch[0].replace(versionMatch[1], version);
        cnt.image = syncFullmatch;
      }

      return native;
    }

    JsonUtils.sync(
      folder, {
        filename,
        path,
        version
      }, true, path.includes("|") ?
      containerPathSetter :
      null);
  }

  if (kind === "config") {

    JsonUtils.sync(folder, {
      filename,
      path,
      version
    });

  }


  return {};
}
