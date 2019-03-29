import fs from 'fs';
import _ from 'lodash';
import path from 'path';
import YAML from 'yamljs'

const load = (folder, filename, isYaml = false) => {
  const contentFile = path.join(folder, filename);
  const content = fs.readFileSync(contentFile, 'utf8')
  return isYaml
    ? YAML.parse(content)
    : JSON.parse(content);
}

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
  const {pluginid} = cxt;
  const dependencies = [];

  {
    const service = load(folder, "service.yaml", true);

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
    const deployment = load(folder, "deployment.yaml", true);

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
      const {image} = deployment.spec.template.spec.containers[contidx];
      const [cntFullname, cntVersion] = image.split(":");

      const contVerPath = "spec.template.spec.containers|" + contidx + "|(?:.+):(.+)";
      dependencies.push({
        dependencyid: 'dependency|deployment.yaml|' + contVerPath,
        kind: "dependency",
        filename: "deployment.yaml",
        path: contVerPath,
        fullname: cntFullname,
        version: cntVersion
      });
    }
  }

  return dependencies;
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

  syncJSONDependency(
    folder, {
    filename,
    path,
    version
  }, true, path.includes("|")
    ? containerPathSetter
    : null);

  return {};
}

export const syncJSONDependency = (folder, {
  filename,
  path: pathToVersion,
  version
}, isYaml = false, setter) => {

  const contentFile = path.join(folder, filename);
  const content = fs.readFileSync(contentFile, 'utf8')
  const native = isYaml
    ? YAML.parse(content)
    : JSON.parse(content);

  const modNative = setter
    ? setter(native, pathToVersion, version)
    : _.set(native, pathToVersion, version)

  fs.writeFileSync(
    contentFile, isYaml
    ? YAML.stringify(modNative, 10, 2)
    : JSON.stringify(modNative, null, 2));
}
