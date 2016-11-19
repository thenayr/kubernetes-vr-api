const express = require('express');
const bodyParser = require ('body-parser');
const app = express();
const JSONStream = require('json-stream');
const jsonStream = new JSONStream();
const sleep = require('sleep');

const server = app.listen(9003, () => {
    console.log('Listening on *:9003');
})

const io = require ('socket.io')(server);

const K8Api = require('kubernetes-client');

const options = {
  url: 'http://127.0.0.1:8090',
  version: 'v1',  // Defaults to 'v1' 
  namespace: 'default', // Defaults to 'default' 
}

// Ugly but works for now (the stream was timing out before)
const streamOptions = {
  url: options.url,
  version: options.version,  // Defaults to 'v1'
  namespace: options.namespace, // Defaults to 'default'
  request: {
    timeout: 0,
    forever: true,
  }
}

const deployOptions = {
  url: options.url,
  version: 'v1beta1',  // Defaults to 'v1' 
  namespace: options.namespace, // Defaults to 'default' 
}

const k8Stream = new K8Api.Core(streamOptions);
const k8 = new K8Api.Core(options);
const k8deploy = new K8Api.Extensions(deployOptions);


// This times out after something like 20 minutes
function getKubeStream() {
  const stream = k8Stream.ns.po.get({ qs: { watch: true } });
  stream.pipe(jsonStream);
  jsonStream.on('data', object => {

    switch(object.type) {
      case 'ADDED':
        // We don't actually do anything with ADDED events currently.
        //var type = '';
        //if ("object.metadata.labels.type" in object) {
          //type = object.object.metadata.labels.type
        //} else {
          //type = "k8s"
        //}
        //var pod = {
          //name: object.object.metadata.name ,
          //ip: "test",
          //start: "test",
          //namespace: object.object.metadata.namespace,
          //type: "nginx"
        //}
        break;
      case 'MODIFIED':
        if(!("deletionTimestamp" in object.object.metadata) && "conditions" in object.object.status && "podIP" in object.object.status) { 
          var type = '';
          console.log("----------");
          console.log(object.object.metadata.name);
          console.log("Found newly added pod: " + object.object.metadata.name);
          console.log("----------");
          if ("type" in object.object.metadata.labels) {
            type = object.object.metadata.labels.type;
          } else {
            type = "k8s";
          }
          var pod = {
            name: object.object.metadata.name ,
            ip: object.object.status.podIP,
            start: object.object.metadata.creationTimestamp,
            namespace: object.object.metadata.namespace,
            type: type
          }
          io.emit('newPod' , pod);
        }
        break;
      case 'DELETED':
        var pod = {
          name: object.object.metadata.name 
        }
        console.log(pod.name + " Deleted");
        io.emit('removePod' , pod);
        break;
      default:
    }
  });
}

function fetchPods(err, result) {
  if (err){
    console.log("Cannot connect to Kubernetes for pods")
    err;
  } else {
    const items = result.items;
    var pods = {};
    for (var i = 0; i < items.length; i++) {
      items[i].metadata.labels.type = items[i].metadata.labels.type ? items[i].metadata.labels.type : "k8s";
    }
    podList = Array.from(items, i => ({ name: i.metadata.name, ip: i.status.podIP, start: i.status.startTime, namespace: i.metadata.namespace, type: i.metadata.labels.type }) );
    podsResponse = { podList };

    // Sometimes this event fires too quickly, lets sleep for a half second
    sleep.sleep(1);

    io.emit('initPod' , podsResponse);
    console.log("sent pod init");
  }
}

function fetchClusterInfo() {
  k8deploy.ns.deployments.get(function (err, deployments) {
    if (err){
      console.log("Cannot connect to Kubernetes for deploys")
      console.log(err);
    } else {
      const items = deployments.items;
      deployList = Array.from(items, i => ({name: i.metadata.name}) );
      deploymentResponse = { deployList };
      deployCount = deployList.length;
      k8.ns.po.get(function (err, pods) {
        if (err){
          console.log("Cannot connect to Kubernetes for pods")
          err;
        } else {
        const items = pods.items;
        podList = Array.from(items, i => ({name: i.metadata.name})) ;
        podResponse = { podList };
        podCount = podList.length;
        var clusterInfo = {
          pods: { count: podCount},
          deployments: { count: deployCount }
        }
        console.log("Emitting cluster data")
        io.emit('clusterData', clusterInfo )
        }
      })
    }
  }
)};

io.on('connection', function(socket) {
    socket.on('sniffPods', function() {
      console.log("Got sniff pods command");
      k8.ns.po.get(fetchPods);
    });
    socket.on('fetchClusterInfo', function() {
      console.log("Got cluster info fetch command");
      fetchClusterInfo();
    });
    socket.on('k8sDestroyPod', function(data) {
      console.log(data);
      k8.ns.po.delete(data.name, (err) => {
        if(err) {
          err;
        }
      });
    })
});

getKubeStream();
