'use strict';
var app = angular.module('com.module.dwDomains');

app.service('DomainsService', ['$state', 'CoreService', 'DwDomain','gettextCatalog','DwDomainEntityType','DwDomainItem','DwTrail','DwTeam', function($state, CoreService, DwDomain, gettextCatalog, DwDomainEntityType, DwDomainItem, DwTrail, DwTeam) {

    this.getDomains = function() {
        return DwDomain.find({
            filter: {
                include: [
                    'domainEntityTypes',
                    'domainItems',
                    'extractors',
                    'trails',
                    'teams'
                ]
            }
        });
    };

    this.getPagedDomains = function(start,number) {
        return DwDomain.find({
            filter: {
                limit: number,
                skip: start,
                order:"name DESC",
                include: [
                    'domainEntityTypes',
                    'domainItems',
                    'extractors',
                    'trails',
                    'teams'
                ]
            }
        });
    };

    this.getDomain = function(id) {
        return DwDomain.findById({
            id: id
        });
    };

    this.getUserTeamDomains = function(teamList) {
        var userTeams = [];
        teamList.forEach(function (team) {
            userTeams.push(team.id);
        });
        var whereClause={
            filter:{
                order:"name DESC",
                include: [
                    'domainEntityTypes',
                    'domainItems',
                    'extractors',
                    'trails',
                    {relation:'teams',
                        scope:{
                            where:{
                                id:{inq:userTeams}
                            }
                        }
                    }
                ]
            }
        };

        return (DwDomain.find(whereClause));
    };

    this.getUserPagedTeamDomains = function(teamList,start,number) {
        var userTeams = [];
        teamList.forEach(function (team) {
            userTeams.push(team.id);
        });
        var whereClause={
            filter:{
                limit: number,
                skip: start,
                where: {
                    id: {inq:userTeams}
                },
                include: [
                    {relation:'domains',
                        scope:{
                            include:[
                                'domainItems',
                                'domainEntityTypes',
                                'extractors',
                                'trails',
                                'teams'
                            ]
                        }
                    }
                ]
            }
        };
        return (DwTeam.find(whereClause));
    };

    this.getPrettyDomain = function(domainId){
        var filter = {
            filter:{
                fields: ['id','name','description'],
                where:{
                    id: domainId
                },

                include: [
                    {relation:'domainEntityTypes',
                        scope:{
                            fields: [
                                'name',
                                'description',
                                'source',
                                {'dwDomainId': false}
                            ]
                        }
                    },
                    {relation:'domainItems',
                        scope:{
                            fields:[
                                'itemValue',
                                'type',
                                'source',
                                'userID',
                                {'dwDomainId': false}
                            ],
                            include:[
                                {relation:'user',scope:{fields: ['userName']}}
                            ]
                        }
                    }
                ]
            }
        };
        return DwDomain.findOne(filter);
    };

    this.getDomainUrls = function(domainId){
        var filter = {
            filter:{
                fields: ['id'],
                where:{
                    dwDomainId: domainId
                },
                include: [
                    {relation:'trailUrls',
                        scope:{
                            //fields: {
                            //    'url',
                            //    'searchTerms'
                            //},
                            include:['urlExtractions']
                        }
                    }
                ]
            }
        };
        return DwTrail.find(filter);
    };

    this.getTopLevels = function(urlList, urlCount){
        //Clean em up
        var strippedUrls = [];
        urlList.forEach(function(url){
            var decodedUrl = decodeURI(url);
            var topLevel = new RegExp('^(?:https?:)?(?:\/\/)?([^\/\?]+)').exec(decodedUrl);
            strippedUrls.push(topLevel[1]);
        });
        //Now count them
        var urlCounts = { };
        for (var i = 0, j = strippedUrls.length; i < j; i++) {
            urlCounts[strippedUrls[i]] = (urlCounts[strippedUrls[i]] || 0) + 1;
        }
        //Now sort them
        var sorted= [];
        for(var key in urlCounts){
            sorted.push({url:key,count:urlCounts[key]});
        }
        sorted.sort(sortBy('count',true)); //Descending

        //Now crop and return them
        return sorted.slice(0,urlCount);
    };

    this.getTopExtractions = function (extractions, extCount){
        // count them
        var extCounts = { };
        for (var i = 0, j = extractions.length; i < j; i++) {
            extCounts[extractions[i]] = (extCounts[extractions[i]] || 0) + 1;
        }

        //Now sort them
        var sorted= [];
        for(var key in extCounts){
            sorted.push({value:key,count:extCounts[key]});
        }
        sorted.sort(sortBy('count',true)); //Descending

        //Now crop and return them
        return sorted.slice(0,extCount);
    };

    function sortBy(key, reverse) {
        // Move smaller items towards the front or back of the array depending on if
        // we want to sort the array in reverse order or not.
        var moveSmaller = reverse ? 1 : -1;

        // Move larger items towards the front or back of the array depending on if
        // we want to sort the array in reverse order or not.
        var moveLarger = reverse ? -1 : 1;
        /**
         * @param  {*} a
         * @param  {*} b
         * @return {Number}
         */
        return function(a, b) {
            if (a[key] < b[key]) {
                return moveSmaller;
            }
            if (a[key] > b[key]) {
                return moveLarger;
            }
            return 0;
        };

    }

    this.upsertDomain = function(domain, cb) {
        DwDomain.upsert(domain, function(newDomain) {
            CoreService.toastSuccess(gettextCatalog.getString('Domain saved'), gettextCatalog.getString('Your domain is safe with us!'));

            //TODO: We must first remove all linked items before adding them, otherwise we can't account for removed links

            //For Many-To-Many relationships you MUST manually link the two models for INCLUDE to work in relationships
            if(domain.dwTeams) {
                domain.dwTeams.forEach(function (team) {
                    DwDomain.teams.link({id: newDomain.id, fk: team}, null, function (value, header) {
                        //success
                    });
                });
            }

            if(domain.dwExtractors) {
                domain.dwExtractors.forEach(function (extractor) {
                    DwDomain.extractors.link({id: newDomain.id, fk: extractor}, null, function (value, header) {
                        //success
                    });
                });
            }
            //For other relationships you MUST manually add the items
            if(domain.domainEntityTypes) {
                domain.domainEntityTypes.forEach(function (det) {
                    DwDomainEntityType.upsert(det, function() {
                        //success
                    }, function(err) {
                    });
                });
            }

            if(domain.domainItems) {
                domain.domainItems.forEach(function (di) {
                DwDomainItem.upsert(di, function() {
                        //success
                    }, function(err) {

                    });
                });
            }

            cb();
        }, function(err) {
            CoreService.toastSuccess(gettextCatalog.getString(
                'Error saving domain '), gettextCatalog.getString(
                    'This domain could not be saved: ') + err);
        });

    };

    this.deleteDomain = function(domain, cb) {
        CoreService.confirm(gettextCatalog.getString('Are you sure?'),
            gettextCatalog.getString('Deleting this cannot be undone'),
            function() {
                //For Many-To-Many relationships you MUST manually unlink the entities before deleting the domain
                if(domain.id.dwTeams) {
                    domain.id.dwTeams.forEach(function (team) {
                        DwDomain.teams.unlink({id: domain.id.id, fk: team}, null, function (value, header) {
                            //success
                            var x = value;
                        });
                    });
                }
                //For Many-To-Many relationships you MUST manually unlink the entities before deleting the domain
                if(domain.id.dwExtractors) {
                    domain.id.dwExtractors.forEach(function (extractor) {
                        DwDomain.extractors.unlink({id: domain.id.id, fk: extractor}, null, function (value, header) {
                            //success
                            var y = value;
                        });
                    });
                }

                //Now delete the domain (cascading deletes provide in dw-domain.js for Domain Items and Domain Types)
                DwDomain.deleteById(domain.id, function() {
                    CoreService.toastSuccess(gettextCatalog.getString('Domain deleted'), gettextCatalog.getString('Your domain is deleted!'));
                    cb();
                }, function(err) {
                    CoreService.toastError(gettextCatalog.getString(
                        'Error deleting domain'), gettextCatalog.getString(
                            'Your domain is not deleted! ') + err);
                });
            },
            function() {
                return false;
            });
    };

}]);
