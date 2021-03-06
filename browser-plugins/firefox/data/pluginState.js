var {on, emit} = require('sdk/event/core');
var {Request} = require('sdk/request');
var PluginState = function () {
  var me = this;
  me.loggedInUser = null;
  me.currentTeam = null;
  me.currentTeamList = [];
  me.currentDomain = null;
  me.currentDomainList = [];
  me.currentDomainItems = [];
  me.currentTrail = null;
  me.currentTrailList = [];
  me.loginUrl = '';
  me.textToHtmlUrl = '/textToHtml';
  me.usersUrl = '/api/AminoUsers';
  me.domainsUrl = '/api/dwDomains';
  me.teamsUrl = '/api/dwTeams';
  me.trailsUrl = '/api/dwTrails';
  me.trailsUrlsUrl = '/api/dwTrailUrls';
  me.domainItemsUrl = '/api/dwDomainItems';
  me.domainList = '/widget/get-domain-list';
  me.trailExtractedEntities = '/widget/get-url-entities';
  me.trailUrlRancor = 'http://localhost:3004/api/rank/process';
  me.createTrail = '/api/dwTrails';
  me.createEntityType = '/api/DwDomainEntityTypes';
  me.createDomainItem = '/api/dwDomains/_domainId_/domainItems';
  me.dwForensic = '/#/app/dwForensic';
  me.dwTrailUrls = '/#/app/dwTrailUrls/list/';
  me.dwTrails = '/#/app/dwTrails';
  me.dwDomains = '/#/app/dwDomains';
  me.dwTrailUrlRating = '/api/dwTrailUrlRatings';
  me.dashboard = '/#/app';
  me.trailingActive = false;
  me.panelActive = false;
  me.dataItemsActive = false;
  me.rancorActive = false;
  me.extractionActive = true;
  me.toolbarFrameSource = null;
  me.toolbarFrameOrigin = null;
  me.datawakeDepotContentScriptHandle = null;
  me.contentScriptHandles = {};
  me.pageModDatawakeDepotIncludeFilter = null;
  me.maxRancorNodes = 15;
  me.sidebarRequester = null;


  me.restRemotePost = function (url, content, callback) {
      Request({
          url: url,
          content: JSON.stringify(content),
          onComplete: callback,
          contentType: 'application/json'
      }).post();
  };

  me.restPost = function (url, content, callback) {
    url = me.loginUrl + url;
    me.restRemotePost(url,content,callback)
  };

  me.restPut = function (url, content, callback) {
      url = me.loginUrl + url;
      Request({
          url: url,
          content: content,
          onComplete: callback
      }).put();
  };

  me.restRemoteGet = function (url, queryStringObj, callback) {
      queryStringObj = queryStringObj || {};
      if(me.loggedInUser) {
          queryStringObj.access_token = me.loggedInUser.accessToken;
      }
      //TODO: must handle complex querystrings

      var queryStringJson = me.convertObjToQueryString(queryStringObj);
      url += '?' + queryStringJson;
      Request({
          url: url,
          onComplete: callback
      }).get();
  };

  me.restGet = function (url, queryStringObj, callback) {
    url = me.loginUrl + url;
    me.restRemoteGet(url,queryStringObj,callback);
  };

  me.restSimpleGet = function (url, callback) {
      url = me.loginUrl + url;
      Request({
          url: url,
          onComplete: callback
      }).get();
  };

  me.getDomainList = function (cb) {
      var url = me.domainList;
      me.restSimpleGet(url, function (res) {
          cb(res.text);
      });
  };

  me.getExtractedEntities = function (trailUrl, cb) {
    var url = me.trailExtractedEntities;
    var filter = {
        "trailUrl":trailUrl
    };
    me.restGet(url, filter, function (res) {
      cb(res.text);
    });
  };

  me.postRancor = function(activeTab){
      if(!me.currentDomainItems){
          return;
      }
      var feedRancorUrl = me.trailUrlRancor;
      var dataItems = me.currentDomainItems.map(function(di){
        return di.itemValue;
      });

      if(!me.sidebarRequester){
          me.sidebarRequester = me.generateUUID();
      }

      var sbRequester = me.sidebarRequester + activeTab.id;

      var rancorFood ={
          dwTrailUrlId: me.currentTrail.id,
          requester:sbRequester,
          urls: activeTab.url,
          terms: dataItems.toString(),
          minScore: dataItems.length/2,
          maxNodes: me.maxRancorNodes,
          ignoreCache:false
      };

      me.restRemotePost(feedRancorUrl, rancorFood,function (res){
          console.log(res);
      });
  };


  me.getRancor = function (activeTabId, cb) {
      var feedRancorUrl = me.trailUrlRancor;
      var filter = {
          "requester": me.sidebarRequester + activeTabId
      };
      me.restRemoteGet(feedRancorUrl, filter, function (res) {
          cb(res.json[0]);
      });
  };

  me.getPageRating = function(trailUrl, cb){
      var strFilter={
          "filter":{
              "where":{
                  "and":[
                      {"url":trailUrl},
                      {"dwTrailId": me.currentTrail.id}
                  ]
              }
          }
      };

      me.restGet(me.dwTrailUrlRating, strFilter, function (res) {
          if(res.status == 200){
            var responseText = JSON.parse(res.text);
            cb(responseText[0].pageRating);
          }else{
            cb();
          }
      });
  };

  me.getDomainItemsForCurrentDomain = function (cb) {
    var url = me.domainItemsUrl;
    var filter = {
      where: {
        dwDomainId: me.currentDomain.id
      }
    };
    me.restGet(url, {filter: JSON.stringify(filter)}, function (res) {
      me.currentDomainItems = res.json;
      cb(res.json);
    });
  };
  me.getTrailsForCurrentTeamAndDomain = function (cb) {
    var url = me.trailsUrl;
    var filter = {
      where: {
        and: [{dwTeamId: me.currentTeam.id},
          {dwDomainId: me.currentDomain.id}]
      }
    };
    me.restGet(url, {filter: JSON.stringify(filter)}, function (res) {
      cb(res.json);
    });
  };
  me.getDomainsForCurrentTeam = function (cb) {
    var url = me.teamsUrl;
    url += '/' + me.currentTeam.id;
    url += '/domains';
    me.restGet(url, {}, function (res) {
      cb(res.json);
    });
  };
  me.getTeamsForLoggedInUser = function (cb) {
    var url = me.usersUrl;
    url += '/' + me.loggedInUser.id;
    url += '/teams';
    me.restGet(url, {}, function (res) {
      cb(res.json);
    });
  };
  me.postMessageToToolBar = function (msg) {
    me.toolbarFrameSource.postMessage(JSON.stringify(msg), me.toolbarFrameOrigin);
  };
  me.postEventToContentScript = function (contentScriptKey, eventName, data) {
    var contentScriptHandle = me.contentScriptHandles[contentScriptKey];
    if (!contentScriptHandle) {
      return;
    }
    contentScriptHandle.port.emit(eventName, data);
  };
  me.postEventToDatawakeDepotContentScript = function (eventName, data) {
    if (!me.datawakeDepotContentScriptHandle) {
      return;
    }
    me.datawakeDepotContentScriptHandle.port.emit(eventName, data);
  };
  me.addContentScriptEventHandler = function (contentScriptKey, eventName, cb) {
    var contentScriptHandle = me.contentScriptHandles[contentScriptKey];
    if (!contentScriptHandle) {getRanc
      return;
    }
    contentScriptHandle.port.on(eventName, cb);
  };
  me.addDatawakeDepotContentScriptEventHandler = function (eventName, cb) {
    me.datawakeDepotContentScriptHandle.port.on(eventName, cb);
  };
  me.postEventToAddInModule = function (eventName, data) {
    emit(exports, eventName, data);
  };
  me.onAddInModuleEvent = function (eventName, cb) {
    on(exports, eventName, cb);
  };
  me.onContentScriptAttach = function (worker) {
    //var newContentScriptKey = me.generateUUID();
    var newContentScriptKey = worker.tab.id;
    me.contentScriptHandles[newContentScriptKey] = worker;
    me.postEventToAddInModule('page-content-script-attached-target-addin',
      {contentScriptKey: newContentScriptKey,pageUrl: worker.tab.url});
    me.postEventToContentScript(newContentScriptKey, 'page-attached-target-content-script',
      {contentScriptKey: newContentScriptKey});
  }
  me.onDatawakeDepotContentScriptAttach = function (worker) {
    me.datawakeDepotContentScriptHandle = worker;
    me.postEventToAddInModule('page-datawake-depot-content-script-attached-target-addin');
    me.postEventToDatawakeDepotContentScript('page-attached-target-content-script');
  }
  me.convertObjToQueryString = function (obj) {
    var str = [];
    for (var p in obj)
      if (obj.hasOwnProperty(p)) {
          var xtype = (typeof obj[p] === 'object');
        if(!xtype)  {
            str.push(encodeURIComponent(p) + "=" + encodeURIComponent(obj[p]));
        }else {
            str.push(encodeURIComponent(p) + "=" + encodeURIComponent(JSON.stringify(obj[p])));
        }

      }
    return str.join("&");
  }
  me.reset = function () {
    me.loggedInUser = null;
    me.currentTeam = null;
    me.currentTeamList = [];
    me.currentDomain = null;
    me.currentDomainList = [];
    me.currentTrail = null;
    me.currentTrailList = [];
  };
  me.generateUUID = function () {
    var d = new Date().getTime();
    var uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (d + Math.random() * 16) % 16 | 0;
      d = Math.floor(d / 16);
      return (c == 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
    return uuid;
  };
};
if (exports.pluginState == null) {
  exports.pluginState = new PluginState();
}
