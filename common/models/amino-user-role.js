var loopback = require('../../lib/loopback');
var debug = require('debug')('loopback:security:role');
var assert = require('assert');
var async = require('async');

var AccessContext = require('../../lib/access-context').AccessContext;

var AminoUserRoleMapping = loopback.AminoUserRoleMapping;

assert(AminoUserRoleMapping, 'AminoUserRoleMapping model must be defined before Role model');

/**
 * The Role model
 * @class Role
 * @header Role object
 */
module.exports = function(Role) {

    // Workaround for https://github.com/strongloop/loopback/issues/292
    AminoUserRole.definition.rawProperties.created.default =
        AminoUserRole.definition.properties.created.default = function() {
            return new Date();
        };

    // Workaround for https://github.com/strongloop/loopback/issues/292
    AminoUserRole.definition.rawProperties.modified.default =
        AminoUserRole.definition.properties.modified.default = function() {
            return new Date();
        };

    AminoUserRole.resolveRelatedModels = function() {
        if (!this.userModel) {
            var reg = this.registry;
            this.roleMappingModel = reg.getModelByType(loopback.AminoUserRoleMapping);
            this.userModel = reg.getModelByType(loopback.User);
            this.applicationModel = reg.getModelByType(loopback.Application);
        }
    };

    // Set up the connection to users/applications/roles once the model
    AminoUserRole.once('dataSourceAttached', function(roleModel) {

        ['users', 'applications', 'roles'].forEach(function(rel) {
            /**
             * Fetch all users assigned to this role
             * @function AminoUserRole.prototype#users
             * @param {object} [query] query object passed to model find call
             * @param  {Function} [callback]
             */
            /**
             * Fetch all applications assigned to this role
             * @function AminoUserRole.prototype#applications
             * @param {object} [query] query object passed to model find call
             * @param  {Function} [callback]
             */
            /**
             * Fetch all roles assigned to this role
             * @function AminoUserRole.prototype#roles
             * @param {object} [query] query object passed to model find call
             * @param {Function} [callback]
             */
            AminoUserRole.prototype[rel] = function(query, callback) {
                roleModel.resolveRelatedModels();
                var relsToModels = {
                    users: roleModel.userModel,
                    applications: roleModel.applicationModel,
                    roles: roleModel
                };

                var ACL = loopback.ACL;
                var relsToTypes = {
                    users: ACL.USER,
                    applications: ACL.APP,
                    roles: ACL.ROLE
                };

                var model = relsToModels[rel];
                listByPrincipalType(model, relsToTypes[rel], query, callback);
            };
        });

        /**
         * Fetch all models assigned to this role
         * @private
         * @param {*} model model type to fetch
         * @param {String} [principalType] principalType used in the rolemapping for model
         * @param {object} [query] query object passed to model find call
         * @param  {Function} [callback] callback function called with `(err, models)` arguments.
         */
        function listByPrincipalType(model, principalType, query, callback) {
            if (callback === undefined) {
                callback = query;
                query = {};
            }

            roleModel.roleMappingModel.find({
                where: {roleId: this.id, principalType: principalType}
            }, function(err, mappings) {
                var ids;
                if (err) {
                    return callback(err);
                }
                ids = mappings.map(function(m) {
                    return m.principalId;
                });
                query.where = query.where || {};
                query.where.id = {inq: ids};
                model.find(query, function(err, models) {
                    callback(err, models);
                });
            });
        }

    });

    // Special roles
    AminoUserRole.OWNER = '$owner'; // owner of the object
    AminoUserRole.RELATED = '$related'; // any User with a relationship to the object
    AminoUserRole.AUTHENTICATED = '$authenticated'; // authenticated user
    AminoUserRole.UNAUTHENTICATED = '$unauthenticated'; // authenticated user
    AminoUserRole.EVERYONE = '$everyone'; // everyone

    /**
     * Add custom handler for roles.
     * @param {String} role Name of role.
     * @param {Function} resolver Function that determines if a principal is in the specified role.
     * Signature must be `function(role, context, callback)`
     */
    AminoUserRole.registerResolver = function(role, resolver) {
        if (!AminoUserRole.resolvers) {
            AminoUserRole.resolvers = {};
        }
        AminoUserRole.resolvers[role] = resolver;
    };

    AminoUserRole.registerResolver(AminoUserRole.OWNER, function(role, context, callback) {
        if (!context || !context.model || !context.modelId) {
            process.nextTick(function() {
                if (callback) callback(null, false);
            });
            return;
        }
        var modelClass = context.model;
        var modelId = context.modelId;
        var userId = context.getUserId();
        AminoUserRole.isOwner(modelClass, modelId, userId, callback);
    });

    function isUserClass(modelClass) {
        if (modelClass) {
            return modelClass === loopback.User ||
                modelClass.prototype instanceof loopback.User;
        } else {
            return false;
        }
    }

    /*!
     * Check if two user IDs matches
     * @param {*} id1
     * @param {*} id2
     * @returns {boolean}
     */
    function matches(id1, id2) {
        if (id1 === undefined || id1 === null || id1 === '' ||
            id2 === undefined || id2 === null || id2 === '') {
            return false;
        }
        // The id can be a MongoDB ObjectID
        return id1 === id2 || id1.toString() === id2.toString();
    }

    /**
     * Check if a given user ID is the owner the model instance.
     * @param {Function} modelClass The model class
     * @param {*} modelId The model ID
     * @param {*} userId The user ID
     * @param {Function} callback Callback function
     */
    AminoUserRole.isOwner = function isOwner(modelClass, modelId, userId, callback) {
        assert(modelClass, 'Model class is required');
        debug('isOwner(): %s %s userId: %s', modelClass && modelClass.modelName, modelId, userId);
        // No userId is present
        if (!userId) {
            process.nextTick(function() {
                callback(null, false);
            });
            return;
        }

        // Is the modelClass User or a subclass of User?
        if (isUserClass(modelClass)) {
            process.nextTick(function() {
                callback(null, matches(modelId, userId));
            });
            return;
        }

        modelClass.findById(modelId, function(err, inst) {
            if (err || !inst) {
                debug('Model not found for id %j', modelId);
                if (callback) callback(err, false);
                return;
            }
            debug('Model found: %j', inst);
            var ownerId = inst.userId || inst.owner;
            // Ensure ownerId exists and is not a function/relation
            if (ownerId && 'function' !== typeof ownerId) {
                if (callback) callback(null, matches(ownerId, userId));
                return;
            } else {
                // Try to follow belongsTo
                for (var r in modelClass.relations) {
                    var rel = modelClass.relations[r];
                    if (rel.type === 'belongsTo' && isUserClass(rel.modelTo)) {
                        debug('Checking relation %s to %s: %j', r, rel.modelTo.modelName, rel);
                        inst[r](processRelatedUser);
                        return;
                    }
                }
                debug('No matching belongsTo relation found for model %j and user: %j', modelId, userId);
                if (callback) callback(null, false);
            }

            function processRelatedUser(err, user) {
                if (!err && user) {
                    debug('User found: %j', user.id);
                    if (callback) callback(null, matches(user.id, userId));
                } else {
                    if (callback) callback(err, false);
                }
            }
        });
    };

    AminoUserRole.registerResolver(AminoUserRole.AUTHENTICATED, function(role, context, callback) {
        if (!context) {
            process.nextTick(function() {
                if (callback) callback(null, false);
            });
            return;
        }
        AminoUserRole.isAuthenticated(context, callback);
    });

    /**
     * Check if the user ID is authenticated
     * @param {Object} context The security context.
     *
     * @callback {Function} callback Callback function.
     * @param {Error} err Error object.
     * @param {Boolean} isAuthenticated True if the user is authenticated.
     */
    AminoUserRole.isAuthenticated = function isAuthenticated(context, callback) {
        process.nextTick(function() {
            if (callback) callback(null, context.isAuthenticated());
        });
    };

    AminoUserRole.registerResolver(AminoUserRole.UNAUTHENTICATED, function(role, context, callback) {
        process.nextTick(function() {
            if (callback) callback(null, !context || !context.isAuthenticated());
        });
    });

    AminoUserRole.registerResolver(AminoUserRole.EVERYONE, function(role, context, callback) {
        process.nextTick(function() {
            if (callback) callback(null, true); // Always true
        });
    });

    /**
     * Check if a given principal is in the specified role.
     *
     * @param {String} role The role name.
     * @param {Object} context The context object.
     *
     * @callback {Function} callback Callback function.
     * @param {Error} err Error object.
     * @param {Boolean} isInRole True if the principal is in the specified role.
     */
    AminoUserRole.isInRole = function(role, context, callback) {
        if (!(context instanceof AccessContext)) {
            context = new AccessContext(context);
        }

        this.resolveRelatedModels();

        debug('isInRole(): %s', role);
        context.debug();

        var resolver = AminoUserRole.resolvers[role];
        if (resolver) {
            debug('Custom resolver found for role %s', role);
            resolver(role, context, callback);
            return;
        }

        if (context.principals.length === 0) {
            debug('isInRole() returns: false');
            process.nextTick(function() {
                if (callback) callback(null, false);
            });
            return;
        }

        var inRole = context.principals.some(function(p) {

            var principalType = p.type || undefined;
            var principalId = p.id || undefined;

            // Check if it's the same role
            return principalType === AminoUserRoleMapping.ROLE && principalId === role;
        });

        if (inRole) {
            debug('isInRole() returns: %j', inRole);
            process.nextTick(function() {
                if (callback) callback(null, true);
            });
            return;
        }

        var roleMappingModel = this.roleMappingModel;
        this.findOne({where: {name: role}}, function(err, result) {
            if (err) {
                if (callback) callback(err);
                return;
            }
            if (!result) {
                if (callback) callback(null, false);
                return;
            }
            debug('Role found: %j', result);

            // Iterate through the list of principals
            async.some(context.principals, function(p, done) {
                var principalType = p.type || undefined;
                var principalId = p.id || undefined;
                var roleId = result.id.toString();

                if (principalId !== null && principalId !== undefined && (typeof principalId !== 'string')) {
                    principalId = principalId.toString();
                }

                if (principalType && principalId) {
                    roleMappingModel.findOne({where: {roleId: roleId,
                            principalType: principalType, principalId: principalId}},
                        function(err, result) {
                            debug('Role mapping found: %j', result);
                            done(!err && result); // The only arg is the result
                        });
                } else {
                    process.nextTick(function() {
                        done(false);
                    });
                }
            }, function(inRole) {
                debug('isInRole() returns: %j', inRole);
                if (callback) callback(null, inRole);
            });
        });

    };

    /**
     * List roles for a given principal.
     * @param {Object} context The security context.
     *
     * @callback {Function} callback Callback function.
     * @param {Error} err Error object.
     * @param {String[]} roles An array of role IDs
     */
    AminoUserRole.getRoles = function(context, callback) {
        if (!(context instanceof AccessContext)) {
            context = new AccessContext(context);
        }
        var roles = [];
        this.resolveRelatedModels();

        var addRole = function(role) {
            if (role && roles.indexOf(role) === -1) {
                roles.push(role);
            }
        };

        var self = this;
        // Check against the smart roles
        var inRoleTasks = [];
        Object.keys(AminoUserRole.resolvers).forEach(function(role) {
            inRoleTasks.push(function(done) {
                self.isInRole(role, context, function(err, inRole) {
                    if (debug.enabled) {
                        debug('In role %j: %j', role, inRole);
                    }
                    if (!err && inRole) {
                        addRole(role);
                        done();
                    } else {
                        done(err, null);
                    }
                });
            });
        });

        var roleMappingModel = this.roleMappingModel;
        context.principals.forEach(function(p) {
            // Check against the role mappings
            var principalType = p.type || undefined;
            var principalId = p.id == null ? undefined : p.id;

            if (typeof principalId !== 'string' && principalId != null) {
                principalId = principalId.toString();
            }

            // Add the role itself
            if (principalType === AminoUserRoleMapping.ROLE && principalId) {
                addRole(principalId);
            }

            if (principalType && principalId) {
                // Please find() treat undefined matches all values
                inRoleTasks.push(function(done) {
                    roleMappingModel.find({where: {principalType: principalType,
                        principalId: principalId}}, function(err, mappings) {
                        debug('Role mappings found: %s %j', err, mappings);
                        if (err) {
                            if (done) done(err);
                            return;
                        }
                        mappings.forEach(function(m) {
                            addRole(m.roleId);
                        });
                        if (done) done();
                    });
                });
            }
        });

        async.parallel(inRoleTasks, function(err, results) {
            debug('getRoles() returns: %j %j', err, roles);
            if (callback) callback(err, roles);
        });
    };
};
