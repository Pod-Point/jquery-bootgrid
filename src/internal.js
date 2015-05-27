// GRID INTERNAL FIELDS
// ====================

var namespace = ".rs.jquery.bootgrid";

// GRID INTERNAL FUNCTIONS
// =====================

function appendRow(row)
{
    var that = this;

    function exists(item)
    {
        return that.identifier && item[that.identifier] === row[that.identifier];
    }

    if (!this.rows.contains(exists))
    {
        this.rows.push(row);
        return true;
    }

    return false;
}

function getParams(context)
{
    return (context) ? $.extend({}, this.cachedParams, { ctx: context }) :
        this.cachedParams;
}

function getRequest()
{
    var request = {
            current: parseInt(this.current),
            rowCount: this.rowCount,
            sort: this.sortDictionary,
            searchPhrase: this.searchPhrase
        },
        post = this.options.post;

    post = ($.isFunction(post)) ? post() : post;
    return this.options.requestHandler($.extend(true, request, post));
}

function getCssSelector(css)
{
    return "." + $.trim(css).replace(/\s+/gm, ".");
}

function getUrl()
{
    var url = this.options.url;
    return ($.isFunction(url)) ? url() : url;
}

function init()
{
    this.element.trigger("initialize" + namespace);

    loadColumns.call(this); // Loads columns from HTML thead tag
    loadStateFromUrl.call(this);
    loadStateFromLocalStorage.call(this);
    this.selection = this.options.selection && this.identifier != null;
    loadRows.call(this); // Loads rows from HTML tbody tag if ajax is false
    prepareTable.call(this);
    renderSearchField.call(this);
    loadData.call(this);
    renderTableHeader.call(this);
    renderTableFooter.call(this);
    replaceHistoryState.call(this);

    var bootgrid = this;

    window.addEventListener('popstate', function(that)
    {
        bootgrid.current = that.state.current;
        bootgrid.sortDictionary = that.state.sortDictionary;

        renderTableHeader.call(bootgrid);
        sortRows.call(bootgrid);
        loadData.call(bootgrid);
    });

    this.element.trigger("initialized" + namespace);
}

function loadStateFromUrl()
{
    var getVars = getUrlVars();

    if (typeof(getVars.page) !== 'undefined') {
        this.current = getVars.page;
    }

    if (typeof(getVars.column) !== 'undefined' && typeof(getVars.direction) !== 'undefined') {
        this.sortDictionary = {};
        this.sortDictionary[getVars.column] = getVars.direction;
    }

    if (typeof(getVars.search) !== 'undefined') {
        this.searchPhrase = window.decodeURI(getVars.search);
    }
}

function loadStateFromLocalStorage()
{
    if (localStorageApiIsAvailable()) {
        var rowCount = parseInt(localStorage.getItem('rowCount' + namespace));
        if (rowCount !== null && Grid.defaults.rowCount.indexOf(rowCount) !== -1) {
            this.rowCount = rowCount;
        } else if (Grid.defaults.rowCount.indexOf(rowCount) === -1) {
            localStorage.removeItem('rowCount' + namespace);
        }
    }
}

function highlightAppendedRows(rows)
{
    if (this.options.highlightRows)
    {
        // todo: implement
    }
}

function isVisible(column)
{
    return column.visible;
}

function loadColumns()
{
    var that = this,
        firstHeadRow = this.element.find("thead > tr").first(),
        sorted = false;

    /*jshint -W018*/
    firstHeadRow.children().each(function ()
    {
        var $this = $(this),
            data = $this.data(),
            column = {
                id: data.columnId,
                identifier: that.identifier == null && data.identifier || false,
                converter: that.options.converters[data.converter || data.type] || that.options.converters["string"],
                text: $this.text(),
                footer: data.footer || "",
                footerClass: data.footerClass || 'text-muted small',
                align: data.align || "left",
                headerAlign: data.headerAlign || "left",
                cssClass: data.cssClass || "",
                headerCssClass: data.headerCssClass || "",
                formatter: that.options.formatters[data.formatter] || null,
                order: (!sorted && (data.order === "asc" || data.order === "desc")) ? data.order : null,
                searchable: !(data.searchable === false), // default: true
                sortable: !(data.sortable === false), // default: true
                visible: !(data.visible === false), // default: true
                firstOrder: data.firstOrder || "asc"
            };
        that.columns.push(column);
        if (column.order != null)
        {
            that.sortDictionary[column.id] = column.order;
        }

        if(column.firstOrder != null)
        {
            if (column.firstOrder === 'asc') {
                that.firstSortDictionary[column.id] = 'desc';
            } else {
                that.firstSortDictionary[column.id] = 'asc';
            }
        }

        // Prevents multiple identifiers
        if (column.identifier)
        {
            that.identifier = column.id;
            that.converter = column.converter;
        }

        // ensures that only the first order will be applied in case of multi sorting is disabled
        if (!that.options.multiSort && column.order !== null)
        {
            sorted = true;
        }
    });
    /*jshint +W018*/
}

/*
response = {
    current: 1,
    rowCount: 10,
    rows: [{}, {}],
    sort: [{ "columnId": "asc" }],
    total: 101
}
*/

function loadData()
{
    var that = this,
        request = getRequest.call(this),
        url = getUrl.call(this);

    if (this.options.ajax && (url == null || typeof url !== "string" || url.length === 0))
    {
        throw new Error("Url setting must be a none empty string or a function that returns one.");
    }

    this.element._bgBusyAria(true).trigger("load" + namespace);
    showLoading.call(this);

    function containsPhrase(row)
    {
        var column,
            searchPattern = new RegExp(that.searchPhrase, (that.options.caseSensitive) ? "g" : "gi");

        for (var i = 0; i < that.columns.length; i++)
        {
            column = that.columns[i];
            if (column.searchable && column.visible &&
                column.converter.to(row[column.id]).search(searchPattern) > -1)
            {
                return true;
            }
        }

        return false;
    }

    function update(rows, total)
    {
        that.currentRows = rows;
        that.total = total;
        that.totalPages = Math.ceil(total / that.rowCount);

        if (!that.options.keepSelection)
        {
            that.selectedRows = [];
        }

        renderActions.call(that);
        renderRows.call(that, rows);
        renderInfos.call(that);
        renderPagination.call(that);

        that.element._bgBusyAria(false).trigger("loaded" + namespace);
    }

    if (this.options.ajax)
    {
        // aborts the previous ajax request if not already finished or failed
        if (that.xqr)
        {
            that.xqr.abort();
        }

        that.xqr = $.ajax({ url:url, data:request, type:this.options.method, success:function (response)
        {
            that.xqr = null;

            if (typeof (response) === "string")
            {
                response = $.parseJSON(response);
            }

            response = that.options.responseHandler(response);

            that.current = response.current;
            update(response.rows, response.total);
        }}).fail(function (jqXHR, textStatus, errorThrown)
        {
            that.xqr = null;

            if (textStatus !== "abort")
            {
                renderNoResultsRow.call(that); // overrides loading mask
                that.element._bgBusyAria(false).trigger("loaded" + namespace);
            }
        });
    }
    else
    {
        var rows = (this.searchPhrase.length > 0) ? this.rows.where(containsPhrase) : this.rows,
            total = rows.length;
        if (this.rowCount !== -1)
        {
            rows = rows.page(this.current, this.rowCount);
        }

        // todo: improve the following comment
        // setTimeout decouples the initialization so that adding event handlers happens before
        window.setTimeout(function () { update(rows, total); }, 10);
    }
}

function loadRows()
{
    if (!this.options.ajax)
    {
        var that = this,
            rows = this.element.find("tbody > tr");

        rows.each(function ()
        {
            var $this = $(this),
                cells = $this.children("td"),
                row = {};

            $.each(that.columns, function (i, column)
            {
                row[column.id] = column.converter.from(cells.eq(i).text());
            });

            appendRow.call(that, row);
        });

        this.total = this.rows.length;
        this.totalPages = (this.rowCount === -1) ? 1 :
            Math.ceil(this.total / this.rowCount);

        sortRows.call(this);
    }
}

function prepareTable()
{
    var tpl = this.options.templates,
        wrapper = (this.element.parent().hasClass(this.options.css.responsiveTable)) ?
            this.element.parent() : this.element;

    this.element.addClass(this.options.css.table);

    // checks whether there is an tbody element; otherwise creates one
    if (this.element.children("tbody").length === 0)
    {
        this.element.append(tpl.body);
    }

    if (this.options.navigation & 1)
    {
        this.header = $(tpl.header.resolve(getParams.call(this, { id: this.element._bgId() + "-header" })));
        wrapper.before(this.header);
    }

    if (this.options.navigation & 2)
    {
        this.footer = $(tpl.footer.resolve(getParams.call(this, { id: this.element._bgId() + "-footer" })));
        wrapper.after(this.footer);
    }
}

function renderActions()
{
    if (this.options.navigation !== 0)
    {
        var css = this.options.css,
            selector = getCssSelector(css.actions),
            headerActions = this.header.find(selector),
            footerActions = this.footer.find(selector);

        if ((headerActions.length + footerActions.length) > 0)
        {
            var that = this,
                tpl = this.options.templates,
                actions = $(tpl.actions.resolve(getParams.call(this)));

            // Download Button (client side only works if browser has HTML 5 download attr available and download option
            // set). This button is disabled if more than 1000 rows exist in the datagrid and no server side download
            // endpoint is available.
            if (
                this.options.ajax &&
                this.options.download &&
                (!window.externalHost && 'download' in document.createElement('a')) &&
                (this.total < 1000 || typeof that.options.download === 'object')
            ) {
                var downloadIcon = tpl.icon.resolve(getParams.call(this, { iconCss: css.iconDownload })),
                    download = $(tpl.actionButton.resolve(getParams.call(this,
                        { content: downloadIcon, text: this.options.labels.download })))
                        .on("click" + namespace, function (e)
                        {
                            e.stopPropagation();

                            var $this = $(this);
                            $this.attr('disabled', 'disabled');

                            $.get(that.options.download.url || that.options.url, function(data) {
                                if(typeof that.options.download === 'string') {
                                    generateCsvUsingJson.call(that, data);
                                } else if (typeof that.options.download === 'object') {
                                    if (typeof that.options.download.callback === 'function') {
                                        that.options.download.callback.call(that, data);
                                    }
                                }
                            }).always(function() {
                                $this.removeAttr('disabled');
                            }).fail(function() {
                                window.alert('Something went wrong while trying to download this data grid.');
                            });
                        });
                actions.append(download);
            }

            // Refresh Button
            if (this.options.ajax)
            {
                var refreshIcon = tpl.icon.resolve(getParams.call(this, { iconCss: css.iconRefresh })),
                    refresh = $(tpl.actionButton.resolve(getParams.call(this,
                    { content: refreshIcon, text: this.options.labels.refresh })))
                        .on("click" + namespace, function (e)
                        {
                            // todo: prevent multiple fast clicks (fast click detection)
                            e.stopPropagation();
                            that.current = 1;
                            loadData.call(that);
                        });
                actions.append(refresh);
            }

            // Row count selection
            renderRowCountSelection.call(this, actions);

            // Column selection
            renderColumnSelection.call(this, actions);

            replacePlaceHolder.call(this, headerActions, actions, 1);
            replacePlaceHolder.call(this, footerActions, actions, 2);
        }
    }
}

function generateCsvUsingJson(data)
{
    var csv = buildCsvString(data.rows);

    var a      = document.createElement('a');
    a.href     = 'data:attachment/csv,' + csv;
    a.target   = '_blank';
    a.download = this.options.download;

    document.body.appendChild(a);

    a.click();
}

function buildCsvString(data)
{
    var csvHeadings = [];
    var csvRows = [];
    var csvString;

    if (data.length > 0) {
        // Grab the column headings
        $.each(data[0], function (key) {
            csvHeadings.push(window.encodeURI('"' + key + '"'));
        });

        csvRows.push(csvHeadings.join(','));

        // Grab the data
        $.each(data, function (key, row) {
            var csvRow = [];

            $.each(row, function (key, data) {
                csvRow.push(window.encodeURI('"' + data + '"'));
            });

            csvRows.push(csvRow.join(','));
        });

        csvString = csvRows.join("%0A");

        return csvString;
    } else {
        return '';
    }
}

function renderColumnSelection(actions)
{
    if (this.options.columnSelection && this.columns.length > 1)
    {
        var that = this,
            css = this.options.css,
            tpl = this.options.templates,
            icon = tpl.icon.resolve(getParams.call(this, { iconCss: css.iconColumns })),
            dropDown = $(tpl.actionDropDown.resolve(getParams.call(this, { content: icon }))),
            selector = getCssSelector(css.dropDownItem),
            checkboxSelector = getCssSelector(css.dropDownItemCheckbox),
            itemsSelector = getCssSelector(css.dropDownMenuItems);

        $.each(this.columns, function (i, column)
        {
            var item = $(tpl.actionDropDownCheckboxItem.resolve(getParams.call(that,
                { name: column.id, label: column.text, checked: column.visible })))
                    .on("click" + namespace, selector, function (e)
                    {
                        e.stopPropagation();

                        var $this = $(this),
                            checkbox = $this.find(checkboxSelector);
                        if (!checkbox.prop("disabled"))
                        {
                            column.visible = checkbox.prop("checked");
                            var enable = that.columns.where(isVisible).length > 1;
                            $this.parents(itemsSelector).find(selector + ":has(" + checkboxSelector + ":checked)")
                                ._bgEnableAria(enable).find(checkboxSelector)._bgEnableField(enable);

                            that.element.find("tbody").empty(); // Fixes an column visualization bug
                            renderTableHeader.call(that);
                            loadData.call(that);
                            renderTableFooter.call(that);
                        }
                    });
            dropDown.find(getCssSelector(css.dropDownMenuItems)).append(item);
        });
        actions.append(dropDown);
    }
}

function renderInfos()
{
    if (this.options.navigation !== 0)
    {
        var selector = getCssSelector(this.options.css.infos),
            headerInfos = this.header.find(selector),
            footerInfos = this.footer.find(selector);

        if ((headerInfos.length + footerInfos.length) > 0)
        {
            var end = (this.current * this.rowCount),
                infos = $(this.options.templates.infos.resolve(getParams.call(this, {
                    end: (this.total === 0 || end === -1 || end > this.total) ? this.total : end,
                    start: (this.total === 0) ? 0 : (end - this.rowCount + 1),
                    total: this.total
                })));

            replacePlaceHolder.call(this, headerInfos, infos, 1);
            replacePlaceHolder.call(this, footerInfos, infos, 2);
        }
    }
}

function renderNoResultsRow()
{
    var tbody = this.element.children("tbody").first(),
        tpl = this.options.templates,
        count = this.columns.where(isVisible).length;

    if (this.selection)
    {
        count = count + 1;
    }
    tbody.html(tpl.noResults.resolve(getParams.call(this, { columns: count })));
}

function renderPagination()
{
    if (this.options.navigation !== 0)
    {
        var selector = getCssSelector(this.options.css.pagination),
            headerPagination = this.header.find(selector)._bgShowAria(this.rowCount !== -1),
            footerPagination = this.footer.find(selector)._bgShowAria(this.rowCount !== -1);

        if (this.rowCount !== -1 && (headerPagination.length + footerPagination.length) > 0)
        {
            var tpl = this.options.templates,
                current = this.current,
                totalPages = this.totalPages,
                pagination = $(tpl.pagination.resolve(getParams.call(this))),
                offsetRight = totalPages - current,
                offsetLeft = (this.options.padding - current) * -1,
                startWith = ((offsetRight >= this.options.padding) ?
                    Math.max(offsetLeft, 1) :
                    Math.max((offsetLeft - this.options.padding + offsetRight), 1)),
                maxCount = this.options.padding * 2 + 1,
                count = (totalPages >= maxCount) ? maxCount : totalPages;

            renderPaginationItem.call(this, pagination, 1, "&laquo;", "first")
                ._bgEnableAria(current > 1);

            var prev = current - 1;
            if (current <= 0) {
                prev = 1;
            }

            renderPaginationItem.call(this, pagination, prev, "&lt;", "prev")
                ._bgEnableAria(current > 1);

            for (var i = 0; i < count; i++)
            {
                var pos = i + startWith;
                renderPaginationItem.call(this, pagination, pos, pos, "page-" + pos)
                    ._bgEnableAria()._bgSelectAria(pos === current);
            }

            if (count === 0)
            {
                renderPaginationItem.call(this, pagination, 1, 1, "page-" + 1)
                    ._bgEnableAria(false)._bgSelectAria();
            }

            var next = current + 1;
            if (current >= totalPages) {
                next = totalPages;
            }

            renderPaginationItem.call(this, pagination, next, "&gt;", "next")
                ._bgEnableAria(totalPages > current);
            renderPaginationItem.call(this, pagination, totalPages, "&raquo;", "last")
                ._bgEnableAria(totalPages > current);

            replacePlaceHolder.call(this, headerPagination, pagination, 1);
            replacePlaceHolder.call(this, footerPagination, pagination, 2);
        }
    }
}

function pushHistoryState()
{
    if (historyApiIsAvailable()) {
        history.pushState({
            current: this.current,
            sortDictionary: this.sortDictionary,
            searchPhrase: this.searchPhrase
        }, null, generateUri.call(this));
    }
}

function replaceHistoryState()
{
    if (historyApiIsAvailable()) {
        history.replaceState({
            current: this.current,
            sortDictionary: this.sortDictionary
        }, null, generateUri.call(this));
    }
}

function generateUri(pageNumber)
{
    var queryItems = [];

    if (typeof(pageNumber) === 'undefined') {
        queryItems.push('page=' + this.current);
    } else if (pageNumber > 0) {
        queryItems.push('page=' + pageNumber);
    }

    jQuery.each(this.sortDictionary, function(column, direction) {
        queryItems.push('column=' + column);
        queryItems.push('direction=' + direction);
    });

    if (this.searchPhrase !== '') {
        queryItems.push('search=' + this.searchPhrase);
    }

    return (queryItems.length > 0)? (historyApiIsAvailable()? '?' : '#') + queryItems.join('&') : '';
}

function historyApiIsAvailable()
{
    return !!(window.history && history.pushState);
}

function localStorageApiIsAvailable()
{
    return (typeof(Storage) !== 'undefined');
}

function getUrlVars()
{
    var vars = {};

    window.location.href.replace(/[?&]+([^=&]+)=([^&]*)/gi, function(m,key,value) {
        vars[key] = value;
    });

    return vars;
}

function renderPaginationItem(list, pageNumber, text, markerCss)
{
    var that = this,
        tpl = this.options.templates,
        css = this.options.css,
        values = getParams.call(this, { css: markerCss, text: text, uri: generateUri.call(this, pageNumber), page: pageNumber }),
        item = $(tpl.paginationItem.resolve(values))
            .on("click" + namespace, getCssSelector(css.paginationButton), function (e)
            {
                if (historyApiIsAvailable()) {
                    e.preventDefault();
                } else {
                    e.stopPropagation();
                }

                var $this = $(this),
                    parent = $this.parent();
                if (!parent.hasClass("active") && !parent.hasClass("disabled"))
                {
                    var commandList = {
                        first: 1,
                        prev: that.current - 1,
                        next: that.current + 1,
                        last: that.totalPages
                    };
                    var command = $this.data('page');
                    that.current = commandList[command] || +command; // + converts string to int
                    loadData.call(that);
                    pushHistoryState.call(that);
                }
                $this.trigger("blur");
            });

    list.append(item);
    return item;
}

function renderRowCountSelection(actions)
{
    var that = this,
        rowCountList = this.options.rowCount;

    function getText(value)
    {
        return (value === -1) ? that.options.labels.all : value;
    }

    if ($.isArray(rowCountList))
    {
        var css = this.options.css,
            tpl = this.options.templates,
            dropDown = $(tpl.actionDropDown.resolve(getParams.call(this, { content: this.rowCount }))),
            menuSelector = getCssSelector(css.dropDownMenu),
            menuTextSelector = getCssSelector(css.dropDownMenuText),
            menuItemsSelector = getCssSelector(css.dropDownMenuItems),
            menuItemSelector = getCssSelector(css.dropDownItemButton);

        $.each(rowCountList, function (index, value)
        {
            var item = $(tpl.actionDropDownItem.resolve(getParams.call(that,
                { text: getText(value), uri: "#" + value })))
                    ._bgSelectAria(value === that.rowCount)
                    .on("click" + namespace, menuItemSelector, function (e)
                    {
                        e.preventDefault();

                        var $this = $(this),
                            newRowCount = +$this.attr("href").substr(1);
                        if (newRowCount !== that.rowCount)
                        {
                            if (localStorageApiIsAvailable()) {
                                localStorage.setItem('rowCount' + namespace, newRowCount);
                            }

                            that.current = 1; // that.rowCount === -1 ---> All
                            that.rowCount = newRowCount;
                            $this.parents(menuItemsSelector).children().each(function ()
                            {
                                var $item = $(this),
                                    currentRowCount = +$item.find(menuItemSelector).attr("href").substr(1);
                                $item._bgSelectAria(currentRowCount === newRowCount);
                            });
                            $this.parents(menuSelector).find(menuTextSelector).text(getText(newRowCount));
                            loadData.call(that);
                        }
                    });
            dropDown.find(menuItemsSelector).append(item);
        });
        actions.append(dropDown);
    }
}

function renderRows(rows)
{
    if (rows.length > 0)
    {
        var that = this,
            css = this.options.css,
            tpl = this.options.templates,
            tbody = this.element.children("tbody").first(),
            allRowsSelected = true,
            html = "",
            cells = "",
            rowAttr = "",
            rowCss = "";

        $.each(rows, function (index, row)
        {
            cells = "";
            rowAttr = " data-row-id=\"" + ((that.identifier == null) ? index : row[that.identifier]) + "\"";
            rowCss = "";

            if (that.selection)
            {
                var selected = ($.inArray(row[that.identifier], that.selectedRows) !== -1),
                    selectBox = tpl.select.resolve(getParams.call(that,
                        { type: "checkbox", value: row[that.identifier], checked: selected }));
                cells += tpl.cell.resolve(getParams.call(that, { content: selectBox, css: css.selectCell }));
                allRowsSelected = (allRowsSelected && selected);
                if (selected)
                {
                    rowCss += css.selected;
                    rowAttr += " aria-selected=\"true\"";
                }
            }

            $.each(that.columns, function (j, column)
            {
                if (column.visible)
                {
                    var value = ($.isFunction(column.formatter)) ?
                            column.formatter.call(that, column, row) :
                                column.converter.to(row[column.id]),
                        cssClass = (column.cssClass.length > 0) ? " " + column.cssClass : "";
                    cells += tpl.cell.resolve(getParams.call(that, {
                        content: (value == null || value === "") ? "&nbsp;" : value,
                        css: ((column.align === "right") ? css.right : (column.align === "center") ?
                            css.center : css.left) + cssClass }));
                }
            });

            if (rowCss.length > 0)
            {
                rowAttr += " class=\"" + rowCss + "\"";
            }
            html += tpl.row.resolve(getParams.call(that, { attr: rowAttr, cells: cells }));
        });

        // sets or clears multi selectbox state
        that.element.find("thead " + getCssSelector(that.options.css.selectBox))
            .prop("checked", allRowsSelected);

        tbody.html(html);

        registerRowEvents.call(this, tbody);
    }
    else
    {
        renderNoResultsRow.call(this);
    }
}

function registerRowEvents(tbody)
{
    var that = this,
        selectBoxSelector = getCssSelector(this.options.css.selectBox);

    if (this.selection)
    {
        tbody.off("click" + namespace, selectBoxSelector)
            .on("click" + namespace, selectBoxSelector, function(e)
            {
                e.stopPropagation();

                var $this = $(this),
                    id = that.converter.from($this.val());

                if ($this.prop("checked"))
                {
                    that.select([id]);
                }
                else
                {
                    that.deselect([id]);
                }
            });
    }

    tbody.off("click" + namespace, "> tr")
        .on("click" + namespace, "> tr", function(e)
        {
            e.stopPropagation();

            var $this = $(this),
                id = (that.identifier == null) ? $this.data("row-id") :
                    that.converter.from($this.data("row-id") + ""),
                row = (that.identifier == null) ? that.currentRows[id] :
                    that.currentRows.first(function (item) { return item[that.identifier] === id; });

            if (that.selection && that.options.rowSelect)
            {
                if ($this.hasClass(that.options.css.selected))
                {
                    that.deselect([id]);
                }
                else
                {
                    that.select([id]);
                }
            }

            that.element.trigger("click" + namespace, [that.columns, row]);
        });
}

function renderSearchField()
{
    if (this.options.navigation !== 0)
    {
        var css = this.options.css,
            selector = getCssSelector(css.search),
            headerSearch = this.header.find(selector),
            footerSearch = this.footer.find(selector);

        if ((headerSearch.length + footerSearch.length) > 0)
        {
            var that = this,
                tpl = this.options.templates,
                timer = null, // fast keyup detection
                currentValue = "",
                searchFieldSelector = getCssSelector(css.searchField),
                search = $(tpl.search.resolve(getParams.call(this, { searchPhrase: this.searchPhrase }))),
                searchField = (search.is(searchFieldSelector)) ? search :
                search.find(searchFieldSelector);

            searchField.on("keyup" + namespace, function (e)
            {
                e.stopPropagation();
                var newValue = $(this).val();
                if (currentValue !== newValue)
                {
                    currentValue = newValue;
                    window.clearTimeout(timer);
                    timer = window.setTimeout(function ()
                    {
                        that.search(newValue);
                    }, 250);
                }
            });

            replacePlaceHolder.call(this, headerSearch, search, 1);
            replacePlaceHolder.call(this, footerSearch, search, 2);
        }
    }
}

function renderTableHeader()
{
    var that = this,
        headerRow = this.element.find("thead > tr"),
        css = this.options.css,
        tpl = this.options.templates,
        html = "",
        sorting = this.options.sorting;

    if (this.selection)
    {
        var selectBox = (this.options.multiSelect) ?
            tpl.select.resolve(getParams.call(that, { type: "checkbox", value: "all" })) : "";
            html += tpl.rawHeaderCell.resolve(getParams.call(that, { content: selectBox,
            css: css.selectCell }));
    }

    $.each(this.columns, function (index, column)
    {
        if (column.visible)
        {
            var sortOrder = that.sortDictionary[column.id],
                iconCss = ((sorting && sortOrder && sortOrder === "asc") ? css.iconUp :
                    (sorting && sortOrder && sortOrder === "desc") ? css.iconDown : ""),
                icon = tpl.icon.resolve(getParams.call(that, { iconCss: iconCss })),
                align = column.headerAlign,
                cssClass = (column.headerCssClass.length > 0) ? " " + column.headerCssClass : "";
            html += tpl.headerCell.resolve(getParams.call(that, {
                column: column, icon: icon, sortable: sorting && column.sortable && css.sortable || "",
                css: ((align === "right") ? css.right : (align === "center") ?
                    css.center : css.left) + cssClass }));
        }
    });

    headerRow.html(html);

    // todo: create a own function for that piece of code
    if (sorting)
    {
        var sortingSelector = getCssSelector(css.sortable);
        headerRow.off("click" + namespace, sortingSelector)
            .on("click" + namespace, sortingSelector, function (e)
            {
                if (historyApiIsAvailable()) {
                    e.preventDefault();
                } else {
                    e.stopPropagation();
                }

                setTableHeaderSortDirection.call(this, that);
                sortRows.call(that);
                loadData.call(that);
                pushHistoryState.call(that);
            });
    }

    // todo: create a own function for that piece of code
    if (this.selection && this.options.multiSelect)
    {
        var selectBoxSelector = getCssSelector(css.selectBox);
        headerRow.off("click" + namespace, selectBoxSelector)
            .on("click" + namespace, selectBoxSelector, function(e)
            {
                e.stopPropagation();

                if ($(this).prop("checked"))
                {
                    that.select();
                }
                else
                {
                    that.deselect();
                }
            });
    }
}

function renderTableFooter()
{
    var that = this,
        footerRow = this.element.find('tfoot > tr'),
        tpl = this.options.templates,
        html = '';

    // Generate HTML for each cell.
    $.each(this.columns, function (index, column) {
        if (column.visible) {
            html += tpl.cell.resolve(getParams.call(that, {
                content: column.footer,
                css:     column.footerClass
            }));
        }
    });

    // Generate row for table cells.
    html = tpl.row.resolve(getParams.call(that, {
        attr:  '',
        cells: html
    }));

    if (footerRow.length === 0) {
        // Generate table footer.
        html = tpl.tableFooter.resolve(getParams.call(that, {
            attr: '',
            row:  html
        }));
        this.element.append(html);
    } else {
        // Replace current table footer.
        this.element.find('tfoot').html(html);
    }
}

function setTableHeaderSortDirection(instance)
{
    var $this = $(this),
        css = instance.options.css,
        iconSelector = getCssSelector(css.icon),
        columnId = $this.data("column-id") || $this.parents("th").first().data("column-id"),
        sortOrder = instance.sortDictionary[columnId] || instance.firstSortDictionary[columnId],
        icon = $this.find(iconSelector);

    if (!instance.options.multiSort)
    {
        $this.parents("tr").first().find(iconSelector).removeClass(css.iconDown + " " + css.iconUp);
        instance.sortDictionary = {};
    }

    if (sortOrder && sortOrder === "asc")
    {
        instance.sortDictionary[columnId] = "desc";
        icon.removeClass(css.iconUp).addClass(css.iconDown);
    }
    else if (sortOrder && sortOrder === "desc")
    {
        if (instance.options.multiSort)
        {
            var newSort = {};
            for (var key in instance.sortDictionary)
            {
                if (key !== columnId)
                {
                    newSort[key] = instance.sortDictionary[key];
                }
            }
            instance.sortDictionary = newSort;
            icon.removeClass(css.iconDown);
        }
        else
        {
            instance.sortDictionary[columnId] = "asc";
            icon.removeClass(css.iconDown).addClass(css.iconUp);
        }
    }
    else
    {
        instance.sortDictionary[columnId] = "asc";
        icon.addClass(css.iconUp);
    }
}

function replacePlaceHolder(placeholder, element, flag)
{
    if (this.options.navigation & flag)
    {
        placeholder.each(function (index, item)
        {
            // todo: check how append is implemented. Perhaps cloning here is superfluous.
            $(item).before(element.clone(true)).remove();
        });
    }
}

function showLoading()
{
    var tpl = this.options.templates,
        thead = this.element.children("thead").first(),
        tbody = this.element.children("tbody").first(),
        firstCell = tbody.find("tr > td").first(),
        padding = (this.element.height() - thead.height()) - (firstCell.height() + 20),
        count = this.columns.where(isVisible).length;

    if (this.selection)
    {
        count = count + 1;
    }
    tbody.html(tpl.loading.resolve(getParams.call(this, { columns: count })));
    if (this.rowCount !== -1 && padding > 0)
    {
        tbody.find("tr > td").css("padding", "20px 0 " + padding + "px");
    }
}

function sortRows()
{
    var sortArray = [];

    function sort(x, y, current)
    {
        current = current || 0;
        var next = current + 1,
            item = sortArray[current];

        function sortOrder(value)
        {
            return (item.order === "asc") ? value : value * -1;
        }

        return (x[item.id] > y[item.id]) ? sortOrder(1) :
            (x[item.id] < y[item.id]) ? sortOrder(-1) :
                (sortArray.length > next) ? sort(x, y, next) : 0;
    }

    if (!this.options.ajax)
    {
        var that = this;

        for (var key in this.sortDictionary)
        {
            if (this.options.multiSort || sortArray.length === 0)
            {
                sortArray.push({
                    id: key,
                    order: this.sortDictionary[key]
                });
            }
        }

        if (sortArray.length > 0)
        {
            this.rows.sort(sort);
        }
    }
}
