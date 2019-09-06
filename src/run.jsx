import _ from 'lodash'
import fs from 'fs-extra'
import path from 'path'
import YAML from 'yamljs';
import {
  spawn,
  wait,
  exec
} from '@nebulario/core-process';
import {
  IO
} from '@nebulario/core-plugin-request';
import * as JsonUtils from '@nebulario/core-json'


const modify = (folder, compFile, func) => {
  const inputPath = path.join(folder, "dist");
  const outputPath = path.join(folder, "tmp");

  if (!fs.existsSync(outputPath)) {
    fs.mkdirSync(outputPath);
  }

  const srcFile = path.join(inputPath, compFile);
  const destFile = path.join(outputPath, compFile);

  const raw = fs.readFileSync(srcFile, "utf8");
  const content = YAML.parse(raw);
  const mod = func(content);

  fs.writeFileSync(destFile, YAML.stringify(mod, 10, 2), "utf8");
}


export const listen = async (params, cxt) => {


  const {
    operation: {
      params: {
        performers,
        performer,
        performer: {
          type,
          code: {
            paths: {
              absolute: {
                folder
              }
            }
          },
          dependents,
          module: {
            dependencies
          }
        },
        feature: {
          featureid
        }
      }
    }
  } = params;

  const deploymentTmpPath = path.join(folder, "tmp", "deployment.yaml");
  const deploy = JsonUtils.load(deploymentTmpPath, true);

  const igosut = await exec(["kubectl get pods --selector=app=" + deploy.metadata.name + " --namespace=" + deploy.metadata.namespace + " --template '{{range .items}}{{.metadata.name}}{{\"\\n\"}}{{end}}'"], {}, {}, cxt);

  const pods = igosut.stdout.trim().split("\n");

  IO.sendEvent("out", {
    data: "Pods " + igosut.stdout
  }, cxt);

  for (const podid of pods) {

    IO.sendEvent("out", {
      data: "Restarting pod " + podid
    }, cxt);

    await exec(["kubectl exec -i " + podid + " -c app --namespace=" + deploy.metadata.namespace + " -- /bin/sh -c \"echo echo date +%s%N > signal\" "], {}, {}, cxt);
  }

}

export const start = (params, cxt) => {

  const {
    performers,
    performer,
    performer: {
      type,
      code: {
        paths: {
          absolute: {
            folder
          }
        }
      },
      dependents,
      module: {
        dependencies
      }
    },
    feature: {
      featureid
    }
  } = params;

  if (type !== "instanced") {
    throw new Error("PERFORMER_NOT_INSTANCED");
  }

  const watcher = async (operation, cxt) => {

    const {
      operationid
    } = operation;

    IO.sendEvent("out", {
      data: "Setting service config..."
    }, cxt);

    const servicePath = path.join(folder, "dist", "service.yaml");
    const serviceTmpPath = path.join(folder, "tmp", "service.yaml");

    modify(folder, "service.yaml", content => {
      content.metadata.namespace = featureid + "-" + content.metadata.namespace;
      return content;
    });

    const nsout = await exec(["kubectl apply -f " + serviceTmpPath], {}, {}, cxt);

    IO.sendEvent("out", {
      data: nsout.stdout
    }, cxt);

    IO.sendEvent("out", {
      data: "Setting deployment config..."
    }, cxt);

    const deploymentPath = path.join(folder, "dist", "deployment.yaml");
    const deploymentTmpPath = path.join(folder, "tmp", "deployment.yaml");

    modify(folder, "deployment.yaml", content => {

      content.metadata.namespace = featureid + "-" + content.metadata.namespace;

      for (const depSrv of dependents) {
        const depSrvPerformer = _.find(performers, {
          performerid: depSrv.moduleid
        });

        if (depSrvPerformer) {
          IO.sendEvent("out", {
            data: "Performing dependent found " + depSrv.moduleid
          }, cxt);

          if (depSrvPerformer.linked.includes("run")) {

            IO.sendEvent("info", {
              data: " - Linked " + depSrv.moduleid
            }, cxt);

            const serviceLabel = _.find(depSrvPerformer.labels, lbl => lbl.startsWith("service:"));

            if (serviceLabel) {
              const service = serviceLabel.split(":")[1];
              IO.sendEvent("out", {
                data: " - Service container " + service
              }, cxt);


              const currCont = _.find(content.spec.template.spec.containers, ({
                name
              }) => name === service);

              if (currCont) {
                const [imgName, imgVer] = currCont.image.split(":");
                currCont.image = imgName + ":linked";

                for (const perf of performers) {

                  const {
                    module: {
                      moduleid,
                      fullname,
                      type
                    },
                    code: {
                      paths: {
                        absolute: {
                          folder: featModuleFolder
                        }
                      }
                    },
                    linked
                  } = perf;

                  if (linked.includes("run") && type === "npm") {

                    IO.sendEvent("info", {
                      data: " - NPM linked " + perf.performerid
                    }, cxt);

                    content.spec.template.spec.volumes = [{
                      name: moduleid,
                      hostPath: {
                        path: "/instance/modules/" + moduleid,
                        type: "Directory"
                      }
                    }]

                    content.spec.template.spec.containers = content.spec.template.spec.containers.map(cont => {

                      cont.command = ["node"];
                      cont.args = ["/app/node_modules/@nebulario/microservice-auth-graph/node_modules/nodemon/bin/nodemon.js", "-L", "--watch", "signal", "/app/node_modules/@nebulario/microservice-auth-graph/src/index.js"];

                      cont.volumeMounts = [{
                        name: moduleid,
                        mountPath: "/app/node_modules/" + fullname
                      }]

                      return cont;
                    })
                  }
                }

              }

            } else {
              IO.sendEvent("warning", {
                data: " - No service label"
              }, cxt);
            }
          } else {
            IO.sendEvent("warning", {
              data: " - Not linked " + depSrv.moduleid
            }, cxt);
          }


        }

        /*



        if (appPerformer.linked.includes("run")) {
          IO.sendEvent("info", {
            data: " - App linked " + appPerformer.performerid
          }, cxt);

          const {
            module: {
              fullname
            },
            code: {
              paths: {
                absolute: {
                  folder: featModuleFolder
                }
              }
            }
          } = appPerformer;

          const entry = featModuleFolder + ":/app/node_modules/" + fullname;
          if (!currServ.volumes) {
            currServ.volumes = [];
          }
          currServ.volumes.push(entry);


        } else {
          IO.sendEvent("warning", {
            data: " - App not linked " + appPerformer.performerid
          }, cxt);
        }

        */

        /*const {
          metadata: {
            service
          }
        } = depSrv;
        const appMod = _.find(modules, {
          moduleid: depSrv.moduleid
        });

        if (appMod) {
          dependentLink(compose.services['app'], modules, appMod);
        }*/
      }


      /*content.spec.template.spec.volumes = [{
        name: "app",
        hostPath: {
          path: "/instance/modules/microservice-auth-graph",
          type: "Directory"
        }

      }]

      content.spec.template.spec.containers = content.spec.template.spec.containers.map(cont => {

        cont.volumeMounts = [{
          name: "app",
          mountPath: "/app/node_modules/@nebulario/microservice-auth-graph"
        }]

        return cont;
      })*/
      return content;
    });



    const igosut = await exec(["kubectl apply -f " + deploymentTmpPath], {}, {}, cxt);

    IO.sendEvent("out", {
      data: igosut.stdout
    }, cxt);

    while (operation.status !== "stopping") {
      await wait(2500);
    }

    IO.sendEvent("stopped", {
      operationid,
      data: "Stopping service config..."
    }, cxt);
  }


  return {
    promise: watcher,
    process: null
  };
}
