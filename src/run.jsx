import _ from "lodash";
import fs from "fs-extra";
import path from "path";
import YAML from "yamljs";
import { spawn, wait, exec } from "@nebulario/core-process";
import { execSync } from "child_process";
import { IO } from "@nebulario/core-plugin-request";
import * as JsonUtils from "@nebulario/core-json";
const uuidv4 = require("uuid/v4");

const copy = (source, target) => {
  const content = fs.readFileSync(source, "utf8");
  fs.writeFileSync(target, content, "utf8");
};

const transformValue = (file, capture, transform) => {
  const content = fs.readFileSync(file, "utf8");
  const match = capture.exec(content);

  if (match) {
    const val = _.trim(match[1], "'");
    const tranf = transform(val);

    const mod = content.replace(new RegExp(val, "g"), tranf);

    fs.writeFileSync(file, mod, "utf8");
  }
};

const modify = (file, func) => {
  const raw = fs.readFileSync(file, "utf8");

  const content = YAML.parse(raw);
  const mod = func(content);

  fs.writeFileSync(file, YAML.stringify(mod, 10, 2), "utf8");
};

const execToPod = async (namespace, podid, cmd, cxt) => {
  return await exec(
    [
      "kubectl exec -i " +
        podid +
        " -c app --namespace=" +
        namespace +
        ' -- /bin/sh -c "' +
        cmd +
        '" '
    ],
    {},
    {},
    cxt
  );
};
//ssh -oStrictHostKeyChecking=no -i $(minikube ssh-key) docker@$(minikube ip) "find /home/docker/instances/dev-auth-service/modules/microservice-auth-web-container/ -type d -name microservice-layout

const cpToPod = async (namespace, podid, source, target, cxt) => {
  //kubectl cp /tmp/foo <some-namespace>/<some-pod>:/tmp/bar

  return await exec(
    ["kubectl cp " + source + " " + namespace + "/" + podid + ":" + target],
    {},
    {},
    cxt
  );
};

const execToHost = async (cmd, cxt) => {
  return await exec(
    [
      'ssh -oStrictHostKeyChecking=no -i $(minikube ssh-key) docker@$(minikube ip) "' +
        cmd +
        '"'
    ],
    {},
    {},
    cxt
  );
};

const copyToHost = (source, target, cxt) => {
  const copyCmd =
    'ssh -oStrictHostKeyChecking=no -i $(minikube ssh-key) docker@$(minikube ip) "rm -Rf ' +
    target +
    ";mkdir -p " +
    target +
    '" && scp -pr -oStrictHostKeyChecking=no  -i $(minikube ssh-key) ' +
    source +
    "/* docker@$(minikube ip):" +
    target;

  return execSync(copyCmd);
};

const getDeploymentPods = async (namespace, name, cxt) => {
  const igosut = await exec(
    [
      "kubectl get pods --selector=app=" +
        name +
        " --namespace=" +
        namespace +
        " --template '{{range .items}}{{.metadata.name}}{{\"\\n\"}}{{end}}'"
    ],
    {},
    {},
    cxt
  );

  return igosut.stdout.trim().split("\n");
};

export const listen = async (params, cxt) => {
  const {
    performerid,
    operation: {
      params: {
        performers,
        performer,
        performer: {
          type,
          code: {
            paths: {
              absolute: { folder }
            }
          },
          dependents,
          module: { dependencies }
        },
        instance: {
          instanceid,
          paths: {
            absolute: { folder: instanceFolder }
          }
        }
      }
    }
  } = params;

  /*IO.sendEvent(
    "info",
    {
      data: JSON.stringify(params, null, 2)
    },
    cxt
  );

  copyToHost(
    path.join(instanceFolder, "modules", performerid, "dist"),
    "instances/" + instanceid + "/output/" + performerid
  */

  //find /app -type d -name microservice-layout

  const tmpPath = path.join(folder, "tmp");

  const deploymentTmpPath = path.join(tmpPath, "deployment.yaml");
  const deploy = JsonUtils.load(deploymentTmpPath, true);

  const pods = await getDeploymentPods(
    deploy.metadata.namespace,
    deploy.metadata.name,
    cxt
  );

  IO.sendEvent(
    "info",
    {
      data: "Pods " + pods
    },
    cxt
  );

  let serviceid = null;

  for (const depSrv of dependents) {
    const depSrvPerformer = _.find(performers, {
      performerid: depSrv.moduleid
    });

    if (depSrvPerformer) {
      if (depSrvPerformer.linked) {
        const serviceLabel = _.find(depSrvPerformer.labels, lbl =>
          lbl.startsWith("service:")
        );

        if (serviceLabel) {
          serviceid = depSrvPerformer.performerid;
        }
      }
    }
  }

  const paths = await execToHost(
    "find /home/docker/instances/" +
      path.join(instanceid, "modules", serviceid) +
      " -type d -name " +
      performerid,
    cxt
  );

  const pathLines = paths.stdout.trim().split("\n");

  for (const line of pathLines) {
    IO.sendEvent(
      "out",
      {
        data: "Update  " + line
      },
      cxt
    );

    await copyToHost(
      path.join(instanceFolder, "modules", performerid, "dist"),
      path.join(line, "dist"),
      cxt
    );
  }

  for (const podid of pods) {
    const cmdid = uuidv4();

    IO.sendEvent(
      "out",
      {
        data: "Restarting inner container app " + podid
      },
      cxt
    );

    await execToPod(
      deploy.metadata.namespace,
      podid,
      'echo "cmd:restart:' + cmdid + '" > /tmp/agent-input',
      cxt
    );
  }

  /*

  find /app -type d -name microservice-layout
  find /app -type d -name microservice-layout


  for (const podid of pods) {


    //kubectl exec -i microservice-auth-web-deployment-857d86956-97w56  -c app --namespace=dev-auth-service-microservices-namespace -- /bin/sh -c "echo date +%s%N > agent"
    await exec(
      [
        "kubectl exec -i " +
          podid +
          " -c app --namespace=" +
          deploy.metadata.namespace +
          ' -- /bin/sh -c "echo date -d@"$(( `date +%s`+180))" > /app/RUNTIME_SIGNAL" '
      ],
      {},
      {},
      cxt
    );
  }
  */
};

export const init = async (params, cxt) => {
  const {
    performers,
    performer: {
      dependents,
      type,
      code: {
        paths: {
          absolute: { folder }
        }
      }
    },
    instance: {
      instanceid,
      paths: {
        absolute: { folder: instanceFolder }
      }
    }
  } = params;

  if (type !== "instanced") {
    throw new Error("PERFORMER_NOT_INSTANCED");
  }

  for (const depSrv of dependents) {
    const depSrvPerformer = _.find(performers, {
      performerid: depSrv.moduleid
    });

    if (depSrvPerformer) {
      IO.sendEvent(
        "out",
        {
          data: "Performing dependent found " + depSrv.moduleid
        },
        cxt
      );

      if (depSrvPerformer.linked) {
        IO.sendEvent(
          "info",
          {
            data: " - Linked " + depSrv.moduleid
          },
          cxt
        );

        const serviceLabel = _.find(depSrvPerformer.labels, lbl =>
          lbl.startsWith("service:")
        );

        if (serviceLabel) {
          IO.sendEvent(
            "info",
            {
              data:
                "Initialize instance module... " +
                depSrvPerformer.module.moduleid
            },
            cxt
          );

          copyToHost(
            path.join(
              instanceFolder,
              "modules",
              depSrvPerformer.module.moduleid
            ),
            "/home/docker/instances/" +
              instanceid +
              "/modules/" +
              depSrvPerformer.module.moduleid
          );
        } else {
          IO.sendEvent(
            "warning",
            {
              data: " - No service label"
            },
            cxt
          );
        }
      } else {
        IO.sendEvent(
          "warning",
          {
            data: " - Not linked " + depSrv.moduleid
          },
          cxt
        );
      }
    }
  }

  return "Runtime service initialized";
};

const mountPackages = (cont, performer, performers, currPath) => {
  const {
    module: { moduleid, fullname, type },
    code: {
      paths: {
        absolute: { folder: featModuleFolder }
      }
    },
    linked,
    dependents
  } = performer;

  for (const depSrv of dependents) {
    const depSrvPerformer = _.find(performers, {
      performerid: depSrv.moduleid
    });

    if (depSrvPerformer) {
      if (
        depSrvPerformer.linked &&
        depSrvPerformer.module.type === "npm"
      ) {
        const depCurrPath =
          currPath + "/node_modules/" + depSrvPerformer.module.fullname;

        cont.volumeMounts = [
          ...(cont.volumeMounts || []),
          {
            name: depSrvPerformer.module.moduleid,
            mountPath: depCurrPath
          }
        ];

        mountPackages(cont, depSrvPerformer, performers, depCurrPath);
      }
    }
  }
};

export const start = (params, cxt) => {
  const {
    init,
    performers,
    performer,
    performer: {
      type,
      code: {
        paths: {
          absolute: { folder }
        }
      },
      dependents,
      module: { dependencies }
    },
    instance: { instanceid },
    plugins
  } = params;

  const tmpPath = path.join(folder, "tmp");
  const distPath = path.join(folder, "dist");

  if (!fs.existsSync(tmpPath)) {
    fs.mkdirSync(tmpPath);
  }

  const watcher = async (operation, cxt) => {
    const { operationid } = operation;

    IO.sendEvent(
      "out",
      {
        data: "Setting service config..."
      },
      cxt
    );

    const servicePath = path.join(distPath, "service.yaml");
    const serviceTmpPath = path.join(tmpPath, "service.yaml");

    copy(servicePath, serviceTmpPath);

    transformValue(
      serviceTmpPath,
      /namespace: (.+)/g,
      val => instanceid + "-" + val
    );

    modify(serviceTmpPath, content => {
      return content;
    });

    const nsout = await exec(
      ["kubectl apply -f " + serviceTmpPath],
      {},
      {},
      cxt
    );

    IO.sendEvent(
      "out",
      {
        data: nsout.stdout
      },
      cxt
    );

    IO.sendEvent(
      "out",
      {
        data: "Setting deployment config..."
      },
      cxt
    );

    //kubectl logs -f my-pod -c my-container

    const deploymentPath = path.join(distPath, "deployment.yaml");
    const deploymentTmpPath = path.join(tmpPath, "deployment.yaml");
    let currentApp = null;

    copy(deploymentPath, deploymentTmpPath);

    transformValue(
      deploymentTmpPath,
      /\s*name: HOST\s*value: (.+)/g,
      val => instanceid + "-" + val
    );
    transformValue(
      deploymentTmpPath,
      /namespace: (.+)/g,
      val => instanceid + "-" + val
    );

    modify(deploymentTmpPath, content => {
      const namespace = content.metadata.namespace;

      content.spec.template.spec.volumes =
        content.spec.template.spec.volumes || [];

      content.spec.template.spec.volumes = [
        /*{
          name: "instance",
          hostPath: {
            path: "/instance",
            type: "Directory"
          }
        },*/
        ...content.spec.template.spec.volumes
      ];

      for (const depSrv of dependents) {
        const depSrvPerformer = _.find(performers, {
          performerid: depSrv.moduleid
        });

        if (depSrvPerformer) {
          IO.sendEvent(
            "out",
            {
              data: "Performing dependent found " + depSrv.moduleid
            },
            cxt
          );

          if (depSrvPerformer.linked) {
            IO.sendEvent(
              "info",
              {
                data: " - Linked " + depSrv.moduleid
              },
              cxt
            );

            const serviceLabel = _.find(depSrvPerformer.labels, lbl =>
              lbl.startsWith("service:")
            );

            if (serviceLabel) {
              const service = serviceLabel.split(":")[1];
              IO.sendEvent(
                "out",
                {
                  data: " - Service container " + service
                },
                cxt
              );

              const currCont = _.find(
                content.spec.template.spec.containers,
                ({ name }) => name === service
              );

              if (currCont) {
                const [imgName, imgVer] = currCont.image.split(":");
                currCont.image = imgName + ":linked";

                for (const depSrvApp of depSrvPerformer.dependents) {
                  const depSrvAppPerformer = _.find(performers, {
                    performerid: depSrvApp.moduleid
                  });

                  if (depSrvAppPerformer) {
                    IO.sendEvent(
                      "out",
                      {
                        data:
                          "Performing dependent NPM found " + depSrvApp.moduleid
                      },
                      cxt
                    );

                    if (
                      depSrvAppPerformer.linked &&
                      depSrvAppPerformer.module.type === "npm"
                    ) {
                      IO.sendEvent(
                        "info",
                        {
                          data: " - Linked " + depSrvApp.moduleid
                        },
                        cxt
                      );

                      const agent = _.find(
                        plugins,
                        ({ pluginid }) => pluginid === "agent:npm"
                      );

                      if (agent) {
                        const appFullname = depSrvAppPerformer.module.fullname;

                        currentApp = depSrvAppPerformer;

                        currCont.command = ["sh"];
                        currCont.args = [
                          "/agent/src/index.sh",
                          Buffer.from(
                            JSON.stringify({
                              ...params,
                              deployment: {
                                container: depSrvPerformer,
                                app: depSrvAppPerformer
                              }
                            })
                          ).toString("base64")
                        ];

                        currCont.volumeMounts = currCont.volumeMounts || [];
                        currCont.volumeMounts = [
                          {
                            name: "agent",
                            mountPath: "/agent"
                          },
                          {
                            name: "app",
                            mountPath: "/app"
                          },
                          ...currCont.volumeMounts
                        ];

                        content.spec.template.spec.volumes = [
                          {
                            name: "agent",
                            hostPath: {
                              path: "/home/docker/agent/" + instanceid + "/npm",
                              type: "Directory"
                            }
                          },
                          {
                            name: "app",
                            hostPath: {
                              path:
                                "/home/docker/instances/" +
                                instanceid +
                                "/modules/" +
                                depSrvPerformer.module.moduleid,
                              type: "Directory"
                            }
                          },
                          ...content.spec.template.spec.volumes
                        ];
                      }
                    } else {
                      IO.sendEvent(
                        "warning",
                        {
                          data: " - Not linked " + depSrvApp.moduleid
                        },
                        cxt
                      );
                    }
                  }
                }

                /*
                cont.volumeMounts = cont.volumeMounts || [];

                cont.volumeMounts.push({
                  name: "agent",
                  mountPath: "/instance/modules/agent.js"
                });
                */

                for (const perf of performers) {
                  const {
                    module: { moduleid, fullname, type },
                    code: {
                      paths: {
                        absolute: { folder: featModuleFolder }
                      }
                    },
                    linked
                  } = perf;

                  if (linked.includes("run") && type === "npm") {
                    IO.sendEvent(
                      "out",
                      {
                        data: " - NPM mounted " + perf.performerid
                      },
                      cxt
                    );
                  }
                }

                content.spec.template.spec.containers = content.spec.template.spec.containers.map(
                  cont => {
                    const HOST_ENV = _.find(
                      cont.env,
                      ({ name }) => name === "HOST"
                    );
                    /*if (HOST_ENV) {
                      const host = HOST_ENV.value;

                      cont.env = cont.env.map(({ name, value }) => ({
                        name,
                        value:
                          typeof value === "string"
                            ? value.replace(host, instanceid + "-" + host)
                            : value
                      }));
                    }*/

                    /*cont.env = cont.env.map(({ name, value }) => ({
                      name,
                      value:
                        typeof value === "string"
                          ? value.replace(
                              namespace,
                              instanceid + "-" + namespace
                            )
                          : value
                    }));*/

                    cont.volumeMounts = cont.volumeMounts || [];

                    cont.volumeMounts = [
                      /*{
                        name: "instance",
                        mountPath: "/instance"
                      },*/
                      ...cont.volumeMounts
                    ];

                    return cont;
                  }
                );
              }
            } else {
              IO.sendEvent(
                "warning",
                {
                  data: " - No service label"
                },
                cxt
              );
            }
          } else {
            IO.sendEvent(
              "warning",
              {
                data: " - Not linked " + depSrv.moduleid
              },
              cxt
            );
          }
        }

        /*



        if (appPerformer.linked) {
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

    const raw2 = fs.readFileSync(deploymentTmpPath, "utf8");
    fs.writeFileSync(
      deploymentTmpPath,
      raw2.replace(new RegExp("- yes", "g"), "- 'yes'"),
      "utf8"
    );

    const igosut = await exec(
      ["kubectl apply -f " + deploymentTmpPath],
      {},
      {},
      cxt
    );

    IO.sendEvent(
      "out",
      {
        data: igosut.stdout
      },
      cxt
    );

    const deploy = JsonUtils.load(deploymentTmpPath, true);

    await wait(500);
    const pods = await getDeploymentPods(
      deploy.metadata.namespace,
      deploy.metadata.name,
      cxt
    );

    /*
    if (init) {
      for (const podid of pods) {
        IO.sendEvent(
          "out",
          {
            data: "Initialize pod " + podid
          },
          cxt
        );

        const cmdid = uuidv4();
        //kubectl exec -i microservice-auth-web-deployment-857d86956-97w56  -c app --namespace=dev-auth-service-microservices-namespace -- /bin/sh -c "echo date +%s%N > agent"

        let podexec = false;
        while (!podexec && operation.status !== "stopping") {
          IO.sendEvent(
            "out",
            {
              data: "init container app dependenices " + cmdid
            },
            cxt
          );
          try {
            await exec(
              [
                "kubectl exec -i " +
                  podid +
                  " -c app --namespace=" +
                  deploy.metadata.namespace +
                  ' -- /bin/sh -c "echo "cmd:init:' +
                  cmdid +
                  '" > /tmp/agent-input" '
              ],
              {},
              {},
              cxt
            );
            podexec = true;
          } catch (e) {
            await wait(1000);
          }
        }

        let done = false;
        while (!done && operation.status !== "stopping") {
          IO.sendEvent(
            "out",
            {
              data: "Check agent result " + cmdid
            },
            cxt
          );

          try {
            const catout = await exec(
              [
                "kubectl exec -i " +
                  podid +
                  " -c app --namespace=" +
                  deploy.metadata.namespace +
                  ' -- /bin/sh -c "cat /tmp/agent/output/' +
                  cmdid +
                  '" '
              ],
              {},
              {},
              cxt
            );

            done = true;
          } catch (e) {
            await wait(1000);
          }
        }
      }
    }*/

    IO.sendEvent(
      "info",
      {
        data: "Linked pods initialized!"
      },
      cxt
    );

    IO.sendEvent("done", {}, cxt);
    /*for (const podid of pods) {
      const cmdid = uuidv4();
      await exec(
        [
          "kubectl exec -i " +
            podid +
            " -c app --namespace=" +
            deploy.metadata.namespace +
            ' -- /bin/sh -c "echo "cmd:restart:' +
            cmdid +
            '" > /tmp/agent-input" '
        ],
        {},
        {},
        cxt
      );
    }*/

    //kubectl logs -f my-pod -c my-container

    while (operation.status !== "stopping") {
      await wait(2500);
    }

    IO.sendEvent(
      "stopped",
      {
        operationid,
        data: "Stopping service config..."
      },
      cxt
    );
  };

  return {
    promise: watcher,
    process: null
  };
};
