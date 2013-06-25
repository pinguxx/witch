(function() {

    // from http://stackoverflow.com/a/2117523/152809, via stapes
    var uid = function() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
            return v.toString(16);
        });
    };


    /*
     Model
     */
    var Model = function(data) {
        $.extend(this, data);
    };
    $.extend(Model.prototype, {
        _callback: function(res) {
            res = this.parse(res);
            if (!this._id && this._collection)
                this._collection.move(this, this._id);

            $.extend(this, res);
        },
        _parse: function(res) { return res; },
        _clean: function() {
            var prop;
            for (prop in this)
                if (this.hasOwnProperty(prop))
                    this[prop] = '';
        },
        toJSON: function() {
            var o = {},
                prop;
            for (prop in this)
                if (this.hasOwnProperty(prop) && prop[0] != '_')
                    o[prop] = this[prop];
            return o;
        },
        fetch: function(data) {
            return rest.get(this.url + this._id, data, this.callback, this);
        },
        save: function() {
            return rest[this._id ? 'put' : 'post'](this.url + this._id, this, this.callback, this);
        },
        saveAs: function() {
            var clone = this.toJSON();
            this._clean();
            return this._collection.push(this.toJSON()).save();
        },
        delete: function() {
            if (this._id)
                return rest.delete(this.url + this._id, {}, function() {
                    this._clean();
                    this._destroyed = true;
                }, this);

            this._clean();
            this._destroyed = true;
        }
    });


    /*
     Collection
     */
    var Collection = function(list, model, url) {
        if (typeof model == 'string') {
            url = model;
            model = null;
        }
        this.model = model || Model;
        this.url = url || this.url;

        this.list = [];
        this.byId = {};
        this.push(list);
    };
    $.extend(Collection.prototype, {
        fetch: function(data) {
            return rest.get(this.url, data, function(res) {
                this.push(res);
            }, this);
        },
        push: function(model) {
            if (Array.isArray(model))
                return model.forEach(this.push.bind(this));

            model = (model instanceof Model) ? model : new this.model(model);
            model._collection = this;
            watch(model, '_destroyed', function(prop, act, val) {
                if (val)
                    this.remove(model);
            }.bind(this));

            this.byId[model._id || uid()] = model;
            this.list.push(model);

            return model;
        },
        remove: function(model) {
            this.list.splice(this.list.indexOf(model), 1);
            callWatchers(this);
        }
    });

    /*
     Template
     */
    var View = function(data, template) {
        this.template || (this.template = template);
        this.data = $.extend({}, this.data, data);
        this.data.tpl = this;
    };
    $.extend(View.prototype, {
        render: function(fn) {
            if (!this.template)
                return console.error('No template', this);

            witch.config.template(this.template, function(err, el) {
                this.el = el;
                this.binding = rivets.bind(this.el, this.data);
                if (fn) fn.call(this);
            }.bind(this));

            return this;
        }
    });

    window.witch = {
        Model: Model,
        Collection: Collection,
        View: View,
        config: {
            template: function(tpl, cb) {
                var el = $('[data-template="' + tpl + '"] :first:not(:empty)').clone();
                cb(!el.length, el);
            }
        }
    };

})();