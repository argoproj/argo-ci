# Roadmap

* V1.0.0 alpha2
  * Support private repositories
  * Use Github API to configure webhook
  * Cleanup completed workflows from Kubernetes CRD
  * Use minio ( and mysql ? ) to show historical data
  * Support more user friendly build pipline definition. Candidates:
    * ksonnet to generate argo workflow
    * generate argo workflow yaml from drone.io pipeline definition http://readme.drone.io/usage/getting-started/  

* V1.0.0
  * Argo CI UI: CI/CD specific UI which allows to view build status/logs etc and manage CI specific configuration
  * User management

# History

* V1.0.0 alpha1
  * Implemented bare minimum which is required to automatically run CI workflow on each push/pull request
  * GitHub webhook handler
  * Integration with Github commit status
  * Helm chart which packages Argo workflow, Argo UI and Argo CI service
  * Argo CI is used to build/test Argo
