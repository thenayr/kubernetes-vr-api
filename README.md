## Description

This is the Node backend for the Kubernetes VR project.  It is meant to work in conjuction with a local `kubectl proxy`.  By default the code will connect to `127.0.0.1:8090`, you can bring up a local proxy by running `kubectl proxy --port=8090`.

For a detailed look into this project, please read [Building the Kubernetes VR experience](https://medium.com/@iamnayr/building-the-kubernetes-virtual-reality-experience-b681464f0c98).

![K8sVr](http://i.giphy.com/l3vR5ZXdynIPI1uI8.gif)

## Build and run

Currently this will only function outside of a Docker container,  the reason being that it connects to localhost to use the Kubectl proxy.  There is the potential of having it run inside of a Kubernetes cluster and talking to the Kubernetes API directly,  but I advise against that for the time being.

Install Dependencies:
`npm install`

Run:
`node index.js`

Note that the Kubernetes watch API will timeout after ~20 minutes.  It will stop sending events for new pods and need to be restarted.

## Disclaimer

Everything here is *HIGHLY* experimental. I offer no gurantees of functionality and strongly advise you to *NOT* use this against any Kubernetes cluster that is not considered completely disposable. Bad things can happen...
