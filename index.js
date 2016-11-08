const express = require('express');
const bodyParser = require ('body-parser');
const path = require('path');
const app = express();
const fs = require('fs');
const JSONStream = require('json-stream');
const jsonStream = new JSONStream();
const pods = fs.readFileSync("pods.json");
const podJson = JSON.parse(pods);
const sleep = require('sleep');
var clusterInfo = {
  podCount: null,
  deployCount: null
}

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

function getKubeStream() {
  const stream = k8Stream.ns.po.get({ qs: { watch: true } });
  stream.pipe(jsonStream);
  jsonStream.on('data', object => {

    switch(object.type) {
      case 'ADDED':
        var type = '';
        if ("object.metadata.labels.type" in object) {
          type = object.object.metadata.labels.type
        } else {
          type = "k8s"
        }
        var pod = {
          name: object.object.metadata.name ,
          ip: object.object.status.podIP,
          start: object.object.status.startTime,
          namespace: object.object.metadata.namespace,
          type: type
        }
        console.log(pod.name + " Added");
        io.emit('newPod' , pod);
        break;
      case 'DELETED':
        var pod = {
          name: object.object.metadata.name 
        }
        console.log(pod.name + " Deleted");
        io.emit('removePod' , pod);
        break;
      default:
      // console.log("Differnet state - " + object.object.kind + " was " + object.type);
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
    console.log("Entering loop")
    for (var i = 0; i < items.length; i++) {
      // console.log(items[i].metadata);
      items[i].metadata.labels.type = items[i].metadata.labels.type ? items[i].metadata.labels.type : "k8s";
    }
    podList = Array.from(items, i => ({ name: i.metadata.name, ip: i.status.podIP, start: i.status.startTime, namespace: i.metadata.namespace, type: i.metadata.labels.type }) );
    podsResponse = { podList };
    // console.log(podsResponse);
    // Sometimes this event fires too quickly, lets sleep for a half second
    sleep.sleep(1);
    io.emit('initPod' , podsResponse);
    console.log("sent pod init");
  }
}

function fetchClusterInfo() {
  // pods = k8.ns.po.get(fetchPods);
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



app.get('/', function(req, res){
    res.sendFile(__dirname + '/index.html');
});

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
