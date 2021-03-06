var loopback = require('../../lib/loopback');

/**
 * The `AminoUserRoleMapping` model extends from the built in `loopback.Model` type.
 *
 * @property {String} id Generated ID.
 * @property {String} name Name of the role.
 * @property {String} Description Text description.
 *
 * @class AminoUserRoleMapping
 * @inherits {PersistedModel}
 */

module.exports = function(AminoUserRoleMapping) {
    // Principal types
    AminoUserRoleMapping.USER = 'USER';
    AminoUserRoleMapping.APP = AminoUserRoleMapping.APPLICATION = 'APP';
    AminoUserRoleMapping.ROLE = 'ROLE';

    AminoUserRoleMapping.resolveRelatedModels = function() {
        if (!this.userModel) {
            var reg = this.registry;
            this.roleModel = reg.getModelByType(loopback.Role);
            this.userModel = reg.getModelByType(loopback.User);
            this.applicationModel = reg.getModelByType(loopback.Application);
        }
    };

    /**
     * Get the application principal
     * @callback {Function} callback
     * @param {Error} err
     * @param {Application} application
     */
    AminoUserRoleMapping.prototype.application = function(callback) {
        this.constructor.resolveRelatedModels();

        if (this.principalType === AminoUserRoleMapping.APPLICATION) {
            var applicationModel = this.constructor.applicationModel;
            applicationModel.findById(this.principalId, callback);
        } else {
            process.nextTick(function() {
                if (callback) callback(null, null);
            });
        }
    };

    /**
     * Get the user principal
     * @callback {Function} callback
     * @param {Error} err
     * @param {User} user
     */
    AminoUserRoleMapping.prototype.user = function(callback) {
        this.constructor.resolveRelatedModels();
        if (this.principalType === AminoUserRoleMapping.USER) {
            var userModel = this.constructor.userModel;
            userModel.findById(this.principalId, callback);
        } else {
            process.nextTick(function() {
                if (callback) callback(null, null);
            });
        }
    };

    /**
     * Get the child role principal
     * @callback {Function} callback
     * @param {Error} err
     * @param {User} childUser
     */
    AminoUserRoleMapping.prototype.childRole = function(callback) {
        this.constructor.resolveRelatedModels();

        if (this.principalType === AminoUserRoleMapping.ROLE) {
            var roleModel = this.constructor.roleModel;
            roleModel.findById(this.principalId, callback);
        } else {
            process.nextTick(function() {
                if (callback) callback(null, null);
            });
        }
    };
};
