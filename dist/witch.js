/* rivets adapter and config */
(function() {
    var subscriber = function(fn) {
        return function(o, path, cb) {
            path = path.split('.');
            fn(o, path[0], cb, path.length - 1)
        };
    };
    var reader = function(o, path, value) {
        if (!path)
            return o;

        var p = path.split('.');
        while (p.length > 1) {
            o = o[p.shift()];
            if (o == undefined)
                break;
        }

        if (arguments.length === 2)
            return o[p.shift()];
        o[p.shift()] = value;
    };

    rivets.configure({
        adapter: {
            subscribe: subscriber(watch),
            unsubscribe: subscriber(unwatch),
            read: reader,
            publish: reader
        },
        handler: function(el, e, binding) {
            if (!$(el).data('default'))
                e.preventDefault();
            return this.call(binding.model, binding);
        }
    });
})();

/* witch */
(function() {
    var slice = [].slice;

    // from http://stackoverflow.com/a/2117523/152809, via stapes
    var uid = function() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
            return v.toString(16);
        });
    };

    /*
     REST
     */
    var rest = function(method, url, data, cb) {
        data = data ? (method == 'get' ? $.param(data) : JSON.stringify(data)) : null;

        return $.ajax({
            type: method,
            url: url,
            data: data,
            success: cb,
            dataType: 'json',
            processData: false,
            contentType: 'application/json'
        });
    };

    [ 'get', 'post', 'put', 'delete' ].forEach(function(method) {
        rest[method] = rest.bind(rest, method);
    });


    /*
     Model
     */
    var Model = function(data, collection) {
        this._collection = collection || this._collection;
		this._callback = this._callback.bind(this);
		this.update(data);
    };
    $.extend(Model.prototype, {
        _parse: function(data) { return data; },
        _callback: function(data) {
            data = this._parse(data);
            if (!this._id && data._id && this._collection)
                this._collection.byId[data._id] = this;
				
            $.extend(this, data);
        },
        _clean: function() {
            var prop;
            for (prop in this)
                if (this.hasOwnProperty(prop) && prop[0] != '_')
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
            return rest.get(this._url + this._id, data, this._callback);
        },
        save: function() {
            return rest[this._id ? 'put' : 'post'](this._url + this._id, this, this._callback);
        },
        saveAs: function() {
            var clone = this.toJSON();
            this._clean();
            return this._collection.push(clone).save();
        },
        delete: function() {
            if (this._id)
                return rest.delete(this._url + this._id, {}, function() {
                    this._clean();
                    this._destroyed = true;
                }.bind(this));

            this._clean();
            this._destroyed = true;
        },
		update: function(data) {
			$.extend(this, this._parse(data));
			return this;
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
        this.model = model || this.model || Model;
        this.url = url || this.url || this.model.prototype._url;

        this.clean();
        if (list)
            this.push(list);
    };
    $.extend(Collection.prototype, {
        clean: function() {
            this.list = [];
            this.byId = {};
            return this;
        },
        fetch: function(data) {
            return rest.get(this.url, data, function(res) {
                this.push(res);
            }.bind(this));
        },
        push: function(model) {
            if (Array.isArray(model)) {
                model.forEach(this.push.bind(this));
                this.filled = true;
                return false;
            }
			
			if (this.byId[model._id])
				return this.byId[model._id].update(model);

            model = (model instanceof Model) ? model : new this.model(model, this);
            model._collection = this;
            if (this.filled)
                model._new = true;

            watch(model, '_destroyed', function(prop, act, val) {
                if (val)
                    this.remove(model);
            }.bind(this));

            if (model._id) ? this.byId[model._id] = model;
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
    var Template = function(data, template) {
        this.template || (this.template = template);
        this.data = $.extend({}, this.data, data);
        this.data.tpl = this;
    };
    $.extend(Template.prototype, {
        render: function(fn) {
            if (!this.template)
                return console.error('No template', this);

            fn || (fn = this.ready);
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
        Template: Template,
        config: {
            template: function(tpl, cb) {
                var el = $('[data-template="' + tpl + '"] > :not(:empty)').clone();
                cb(!el.length, el);
            },
            preload: true
        },
        init: function() {
            $('[data-rivets]').each(function() {
                var t = $(this),
                    m = window[t.data('rivets')];
                if (m)
                    m._rivets = rivets.bind(t, m);
            });
        },
        inherit: function() {
            var args = slice.call(arguments),
                parent = args[0],
                Class = function() {
                    parent.apply(this, arguments);
                };
            args.unshift(Class);
            $.extend.apply(this, args.map(function(c) {
                return (typeof c == 'function') ? c.prototype : c;
            }));
            return Class;
        },
        rest: rest
    };

    $(function() {
        if (witch.config.preload)
            witch.init();
    });

})();