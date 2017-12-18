**PROJECT IS IN EARLY DEVELOPMENT STAGE**

# Argo CI

Argo CI is a continuous integration and deployment system powered by [Argo](http://argoproj.io) workflow engine for Kubernetes. Argo CI provides integration with SCM
( currently only Github is supported) and automatically triggers CI workflow defined using [Argo YAML DSL](https://applatix.com/open-source/argo/docs/argo_v2_yaml.html).

## Deploy Argo CI to your kubernetes cluster
To be described.

## Configure integration with Github

Following steps are required to configure integration:

* Create webhook using [Github UI](https://developer.github.com/webhooks/creating/#setting-up-a-webhook):
  * set Payload URL to `http<ArgoCiDomain>/api/webhook/github`
  * set Content Type to `application/json`
  * set your Secret token values
* Create build workflow and save at `.argo-ci/ci.yaml` inside of your project repository. If workflow has parameters named `revision` and `repo` then Argo CI will automatically set values for these parameters.

## Build and debug

To build project locally install [nodejs](https://nodejs.org) and [yarn](https://yarnpkg.com). Once you install npm dependencies using `yarn install` you are ready to build and
debug project locally:

* Execute `yarn build` to build project. Command stores build results in `./dist` directory.
* Execute `yarn start` to start service locally. Following environment variables should be set before running service:
  * GITHUB-SECRET - Github [webhook](https://developer.github.com/webhooks/creating/#setting-up-a-webhook) secret
  * GITHUB_USER and GITHUB_PASSWORD  - Github account username and password. Account should have permissions to update commit status.
  * ARGO_UI_URL - externally available [Argo](http://argoproj.io) UI URL.
