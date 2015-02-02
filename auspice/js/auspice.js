function gatherTips(node, tips) {
	if (typeof node.children != "undefined") {
		for (var i=0, c=node.children.length; i<c; i++) {
			gatherTips(node.children[i], tips);
		}
	}
	else {
		tips.push(node);
	}
	return tips;
}

function gatherInternals(node, internals) {
	if (typeof node.children != "undefined") {
		internals.push(node);
		for (var i=0, c=node.children.length; i<c; i++) {
			gatherInternals(node.children[i], internals);
		}
	}
	return internals;
}

function getVaccines(tips) {
	vaccineChoice = {};
	vaccineChoice['A/Fujian/411/2002'] = "2003-09-25";
	vaccineChoice['A/California/7/2004'] = "2005-02-21";
	vaccineChoice['A/Wisconsin/67/2005'] = "2006-02-21";
	vaccineChoice['A/Brisbane/10/2007'] = "2007-09-25";
	vaccineChoice['A/Perth/16/2009'] = "2009-09-25";
	vaccineChoice['A/Victoria/361/2011'] = "2012-02-21";
	vaccineChoice['A/Texas/50/2012'] = "2013-09-25";
	vaccineChoice['A/Switzerland/9715293/2013'] = "2014-09-25";
	vaccineStrains = Object.keys(vaccineChoice);
	vaccines = [];
	tips.forEach(function (tip) {
		if (vaccineStrains.indexOf(tip.strain) != -1) {
			tip.choice = vaccineChoice[tip.strain];
			vaccines.push(tip);
		}
	})
	return vaccines;
}

function setDistances(node) {
	if (typeof node.ep == "undefined") {
		node.ep = 0.0;
	}
	if (typeof node.ne == "undefined") {
		node.ne = 0.0;
	}
	if (typeof node.children != "undefined") {
		for (var i=0, c=node.children.length; i<c; i++) {
			setDistances(node.children[i]);
		}
	}
}

function calcBranchLength(node){
	if (typeof node.children != "undefined") {
	for (var i=0, c=node.children.length; i<c; i++) {
		calcBranchLength(node.children[i]);
		node.children[i].branch_length = node.children[i].xvalue-node.xvalue;
	}
	}
};

/**
sets each node in the tree to alive=true if it has at least one descendent with current=true
**/
function setNodeAlive(node){
	if (typeof node.children != "undefined") {
		var aliveChildren=false;
		for (var i=0, c=node.children.length; i<c; i++) {
			setNodeAlive(node.children[i]);
			aliveChildren = aliveChildren||node.children[i].alive
		}   
		node.alive = aliveChildren;
	}else{
		node.alive = node.current;
	}
};

/**
 * for each node, calculate the exponentially attenuated tree length below the node
 * the polarizer is send "up", i.e. to parents
**/
function calcUpPolarizers(node){
	node.up_polarizer = 0;
	if (typeof node.children != "undefined") {
		for (var i=0; i<node.children.length; i++) {
		calcUpPolarizers(node.children[i]);
		node.up_polarizer += node.children[i].up_polarizer;
		}
	}
	bl =  node.branch_length/LBItau;
	node.up_polarizer *= Math.exp(-bl);
	if (node.alive){ // only alive branches contribute anything
		node.up_polarizer += LBItau*(1-Math.exp(-bl));
	}
};

/**
 * for each node, calculate the exponentially attenuated tree length above the node,
 * that is "outside" the clade defined by this node. this down polarizer is send to children
**/
function calcDownPolarizers(node){
	if (typeof node.children != "undefined") {
	for (var i1=0; i1<node.children.length; i1++) {
		node.children[i1].down_polarizer = node.down_polarizer;
		for (var i2=0; i2<node.children.length; i2++) {
			if (i1!=i2){
			node.children[i1].down_polarizer += node.children[i2].up_polarizer;
			}
		}
		// account for the attenuation over the branch_length 
		bl =  node.children[i1].branch_length/LBItau;
		node.children[i1].down_polarizer *= Math.exp(-bl);
		if (node.children[i1].alive) { //the branch contributes only when the node is alive 
			node.children[i1].down_polarizer += LBItau*(1-Math.exp(-bl));
		}
		calcDownPolarizers(node.children[i1]);
	}
	}
};

function calcPolarizers(node){
	calcUpPolarizers(node);
	node.down_polarizer = 0; // set the down polarizer of the root to 0
	calcDownPolarizers(node);
};

/**
 * calculate the LBI for all nodes downstream of node
 * allnodes is provided for easy normalization at the end
**/
function calcLBI(node, allnodes){
	setNodeAlive(node);
	calcPolarizers(node);
	allnodes.forEach(function (d) {
		d.LBI=0;
		d.LBI+=d.down_polarizer;
		if (typeof d.children != "undefined") {
			for (var i=0; i<d.children.length; i++) {
				d.LBI += d.children[i].up_polarizer;
			}
		}
	});
	// normalize the LBI to range [0,1]
	maxLBI = d3.max(allnodes.map(function (d) {return d.LBI;}));
	allnodes.forEach(function (d){ d.LBI /= maxLBI;});
};

/**
 * for each node, calculate the number of tips in the currently selected time window. 
**/
function calcTipCounts(node){
	node.tipCount = 0;
	if (typeof node.children != "undefined") {
		for (var i=0; i<node.children.length; i++) {
			calcTipCounts(node.children[i]);
			node.tipCount += node.children[i].tipCount;
		}
	}
	else if (node.current){ 
		node.tipCount = 1;
	}
};

function minimumAttribute(node, attr, min) {
	if (typeof node.children != "undefined") {
		for (var i=0, c=node.children.length; i<c; i++) {
			min = minimumAttribute(node.children[i], attr, min);
		}
	}
	else {
		if (node[attr] < min) {
			min = node[attr];
		}
	}
	return min;
}

function maximumAttribute(node, attr, max) {
	if (typeof node.children != "undefined") {
		for (var i=0, c=node.children.length; i<c; i++) {
			max = maximumAttribute(node.children[i], attr, max);
		}
	}
	else {
		if (node[attr] > max) {
			max = node[attr];
		}
	}
	return max;
}

var width = 800,
	height = 600;

var globalDate = new Date();
var ymd_format = d3.time.format("%Y-%m-%d");

var LBItau = 0.0008,
	time_window = 1.0;  // layer of one year that is considered current or active


var tree = d3.layout.tree()
	.size([height, width]);

var treeplot = d3.select("#treeplot")
	.attr("width", width)
	.attr("height", height);

var virusTooltip = d3.tip()
	.direction('e')
	.attr('class', 'd3-tip')
	.offset([0, 12])
	.html(function(d) {
		string = ""
		if (typeof d.strain != "undefined") {
			string += "Strain: " + d.strain;
		}
		if (typeof d.date != "undefined") {
			string += "<br>Date: " + d.date;
		}
		if (typeof d.ep != "undefined") {
			string += "<br>Epitope distance: " + d.ep;
		}
		if (typeof d.ne != "undefined") {
			string += "<br>Non-epitope distance: " + d.ne;
		}
		if (typeof d.rb != "undefined") {
			string += "<br>Receptor binding distance: " + d.rb;
		}
		if (typeof d.rb != "undefined") {
			string += "<br>Local branching index: " + d.LBI.toFixed(3);
		}
		return string;
	});
treeplot.call(virusTooltip);

var linkTooltip = d3.tip()
	.direction('e')
	.attr('class', 'd3-tip')
	.offset([0, 12])
	.html(function(d) {
		string = ""
		if (typeof d.freq != "undefined") {
			string += "Frequency: " + (100 * d.freq).toFixed(1) + "%";
		}
		return string;
	});
treeplot.call(linkTooltip);

function rescale(dMin, dMax, lMin, lMax, xScale, yScale, nodes, links, tips, internals, vaccines) {

	var speed = 1500;
	xScale.domain([dMin,dMax]);
	yScale.domain([lMin,lMax]);

	nodes.forEach(function (d) {
		d.x = xScale(d.xvalue);
		d.y = yScale(d.yvalue);
	});

	treeplot.selectAll(".tip").data(tips)
		.transition().duration(speed)
		.attr("cx", function(d) { return d.x; })
		.attr("cy", function(d) { return d.y; });

	treeplot.selectAll(".vaccine").data(vaccines)
		.transition().duration(speed)
		.attr("x", function(d) { return d.x; })
		.attr("y", function(d) { return d.y; });

	treeplot.selectAll(".internal").data(internals)
		.transition().duration(speed)
		.attr("x", function(d) {
			if (typeof d.freq != "undefined") {
				return d.x - 5*Math.sqrt(d.freq) - 0.5;
			}
			else {
				return d.x - 1;
			}
		})
		.attr("y", function(d) {
			if (typeof d.freq != "undefined") {
				return d.y - 5*Math.sqrt(d.freq) - 0.5;
			}
			else {
				return d.y - 1;
			}
		});

	treeplot.selectAll(".link").data(links)
		.transition().duration(speed)
		.attr("points", function(d) {
			return (d.source.x).toString() + "," + d.source.y.toString() + " "
			+ (d.source.x).toString() + "," + d.target.y.toString() + " "
			+ (d.target.x).toString() + "," + d.target.y.toString()
		});

}

d3.json("data/tree.json", function(error, root) {

	if (error) return console.warn(error);

	var nodes = tree.nodes(root),
		links = tree.links(nodes);

	var rootNode = nodes[0];
	var tips = gatherTips(rootNode, []);
	var internals = gatherInternals(rootNode, []);
	calcBranchLength(rootNode);
	rootNode.branch_length= 0.01;
	nodes.forEach(function (d) {d.dateval = new Date(d.date)});

	var vaccines = getVaccines(tips);

	var xValues = nodes.map(function(d) {
		return +d.xvalue;
	});

	var yValues = nodes.map(function(d) {
		return +d.yvalue;
	});

	var dateValues = nodes.filter(function(d) {
		return typeof d.date === 'string';
		}).map(function(d) {
		return new Date(d.date);
	});

	var xScale = d3.scale.linear()
		.domain([d3.min(xValues), d3.max(xValues)])
		.range([10, width-10]);

	var yScale = d3.scale.linear()
		.domain([d3.min(yValues), d3.max(yValues)])
		.range([10, height-10]);

	nodes.forEach(function (d) {
		d.x = xScale(d.xvalue);
		d.y = yScale(d.yvalue);
	});

	var earliestDate = new Date(d3.min(dateValues));
	earliestDate.setDate(earliestDate.getDate() + 180);

	var dateScale = d3.time.scale()
		.domain([earliestDate, globalDate])
		.range([5, 215])
		.clamp([true]);	

	var niceDateScale = d3.time.scale()
		.domain([earliestDate, globalDate])
		.range([5, 215])
		.clamp([true])
    	.nice(d3.time.month);

	var recencySizeScale = d3.scale.threshold()
		.domain([0.0, 1.0])
		.range([0, 4, 0]);

	var recencyVaccineSizeScale = d3.scale.threshold()
		.domain([0.0])
		.range([0, 8]);

	var recencyLinksSizeScale = d3.scale.threshold()
		.domain([0.0])
		.range([0, 2]);

	var colors = ["#5097BA", "#5DA8A3", "#6EB389", "#83BA70", "#9ABE5C", "#B2BD4D", "#C8B944", "#D9AD3D", "#E49938", "#E67C32", "#E2562B"];
	var colorBy = "ep";
	
	var epitopeColorScale = d3.scale.linear().clamp([true])
      .domain([-1.66, -1.33, -1.0, -0.66, -0.33, 0, 0.33, 0.66, 1.0, 1.33, 1.66])
      .range(colors);		

	var nonepitopeColorScale = d3.scale.linear().clamp([true])
		.domain([-1.66, -1.33, -1.0, -0.66, -0.33, 0, 0.33, 0.66, 1.0, 1.33, 1.66])
		.range(colors);

	var receptorBindingColorScale = d3.scale.linear().clamp([true])
		.domain([-1.0, -0.8, -0.6, -0.4, -0.2, 0, 0.2, 0.4, 0.6, 0.8, 1.0])
		.range(colors);

	var lbiColorScale = d3.scale.linear()
		.domain([0.0, 0.02, 0.04, 0.07, 0.1, 0.2, 0.4, 0.7, 0.9, 1.0])
		.range(colors);

	var colorScale = epitopeColorScale;
	tips.map(function(d) { d.coloring = d.ep; });
	
	var freqScale = d3.scale.linear()
		.domain([0, 1])
		.range([1.5, 4.5]);
		
	function calcNodeAges(tw){
		tips.forEach(function (d) {
			var date = new Date(d.date);
			var oneYear = 365.25*24*60*60*1000; // days*hours*minutes*seconds*milliseconds
			var diffYears = (globalDate.getTime() - date.getTime()) / oneYear;
			d.diff = diffYears;
			if (d.diff > 0 && d.diff < tw){
				d.current  = true;
			}else{
				d.current = false;
			}
		});
	}; 	

	function adjust_coloring_by_date() {
		if (colorBy == "ep" || colorBy == "ne" || colorBy == "rb") {
			var mean = 0;
			var recent_tip_count = 0;
			tips.forEach(function (d) {
				if (d.current) {
					mean += d.coloring;
					recent_tip_count += 1;
				}
			});
			mean = mean / recent_tip_count;
			tips.forEach(function (d) {
				d.adj_coloring = d.coloring - mean;
			});
		}
		if (colorBy == "lbi") {
			calcLBI(rootNode, nodes, false);
			tips.forEach(function (d) {
				d.adj_coloring = d.LBI;
			});
		}
	}
	
	function adjust_freq_by_date() {
		calcTipCounts(rootNode);
		var tipCount = rootNode.tipCount;		
		console.log("Total tipcount: " + tipCount);	
		nodes.forEach(function (d) {
			d.freq = (d.tipCount)/tipCount;
		});
	}	

	calcNodeAges(time_window);
	adjust_coloring_by_date();
	adjust_freq_by_date();
	calcLBI(rootNode, nodes, false);

	var link = treeplot.selectAll(".link")
		.data(links)
		.enter().append("polyline")
		.attr("class", "link")
		.attr("points", function(d) {
			var mod = 0.5 * freqScale(d.target.freq) - freqScale(0);
			return (d.source.x-mod).toString() + "," + d.source.y.toString() + " "
			+ (d.source.x-mod).toString() + "," + d.target.y.toString() + " "
			+ (d.target.x).toString() + "," + d.target.y.toString()
		})
		.style("stroke-width", function(d) {
			return freqScale(d.target.freq);
		})
		.style("stroke", "#ccc")
		.style("cursor", "pointer")
		.on('mouseover', function(d) {
			linkTooltip.show(d.target, this);
		})
		.on('mouseout', linkTooltip.hide)		
		.on('click', function(d) {
			var dMin = minimumAttribute(d.target, "xvalue", d.target.xvalue),
				dMax = maximumAttribute(d.target, "xvalue", d.target.xvalue),
				lMin = minimumAttribute(d.target, "yvalue", d.target.yvalue),
				lMax = maximumAttribute(d.target, "yvalue", d.target.yvalue);
			rescale(dMin, dMax, lMin, lMax, xScale, yScale, nodes, links, tips, internals, vaccines);
		});

	var tipCircles = treeplot.selectAll(".tip")
		.data(tips)
		.enter()
		.append("circle")
		.attr("class", "tip")
		.attr("id", function(d) { return (d.strain).replace(/\//g, ""); })
		.attr("cx", function(d) { return d.x; })
		.attr("cy", function(d) { return d.y; })
		.attr("r", function(d) {
			return recencySizeScale(d.diff);
		})
		.style("fill", function(d) {
			var col = colorScale(d.adj_coloring);
			return d3.rgb(col).brighter([0.7]).toString();
		})
		.style("stroke", function(d) {
			var col = colorScale(d.adj_coloring);
			return d3.rgb(col).toString();
		})
		.on('mouseover', function(d) {
			virusTooltip.show(d, this);
		})
		.on('mouseout', virusTooltip.hide);

	var vaccineCircles = treeplot.selectAll(".vaccine")
		.data(vaccines)
		.enter()
		.append("text")
		.attr("class", "vaccine")
		.attr("x", function(d) {return d.x})
		.attr("y", function(d) {return d.y})
		.attr('text-anchor', 'middle')
		.attr('dominant-baseline', 'central')
		.style("font-size", "28px")
		.style('font-family', 'FontAwesome')
		.style("fill", "#555555")
		.text(function(d) { return '\uf00d'; })
		.style("cursor", "default")
		.on('mouseover', function(d) {
			virusTooltip.show(d, this);
		})
		.on('mouseout', virusTooltip.hide);


	var drag = d3.behavior.drag()
		.origin(function(d) { return d; })
		.on("drag", dragged)
		.on("dragstart", function() {
			d3.selectAll(".date-input-text").style("fill", "#5DA8A3");
		})
		.on("dragend", function() {
			d3.selectAll(".date-input-text").style("fill", "#CCCCCC");
			dragend();
		});

	function dragged(d) {

		d.date = dateScale.invert(d3.event.x);
		d.x = dateScale(d.date);
		d3.selectAll(".date-input-text")
			.attr("x", function(d) {return 0.3*d.x})
			.text(function(d) {
				var format = d3.time.format("%Y %b %-d");
				return format(d.date)
			});
		d3.selectAll(".date-input-marker")
			.attr("cx", function(d) {return d.x})
		globalDate = d.date;
	}

	function dragend() {
		console.log("recalculating node ages");
		calcNodeAges(time_window);
		console.log("adjusting node colors");
		adjust_coloring_by_date();
		console.log("updating frequencies");
		adjust_freq_by_date();

		d3.selectAll(".link")
			.attr("points", function(d) {
				var mod = 0.5 * freqScale(d.target.freq) - freqScale(0);				
				return (d.source.x-mod).toString() + "," + d.source.y.toString() + " "
				+ (d.source.x-mod).toString() + "," + d.target.y.toString() + " "
				+ (d.target.x).toString() + "," + d.target.y.toString()
			})
			.style("stroke-width", function(d) {
				return freqScale(d.target.freq);
			});
		d3.selectAll(".tip")
			.attr("r", function(d) {
				return recencySizeScale(d.diff);
			})
			.style("fill", function(d) {
				var col = colorScale(d.adj_coloring);
				return d3.rgb(col).brighter([0.7]).toString();
			})
			.style("stroke", function(d) {
				var col = colorScale(d.adj_coloring);
				return d3.rgb(col).toString();
			});
		d3.selectAll(".vaccine")
			.style("visibility", function(d) {
				var date = new Date(d.choice);
				var oneYear = 365.25*24*60*60*1000; // days*hours*minutes*seconds*milliseconds
				var diffYears = (globalDate.getTime() - date.getTime()) / oneYear;
				if (diffYears > 0) { return "visible"; }
				else { return "hidden"; }
			});

	}

	var counterData = {}
	counterData['date'] = globalDate
	counterData['x'] = dateScale(globalDate)

	d3.select("#date-input")
		.attr("width", 240)
		.attr("height", 65);

	var counter = d3.select("#date-input").selectAll(".date-input-text")
		.data([counterData])
		.enter()
		.append("text")
		.attr("class", "date-input-text")
		.attr("text-anchor", "left")
		.attr("x", function(d) {return 0.3*d.x})
		.attr("dy", "0.75em")
		.text(function(d) {
			var format = d3.time.format("%Y %b %-d");
			return format(d.date)
		})
		.style("cursor", "pointer")
		.call(drag);

	var customTimeFormat = d3.time.format.multi([
		[".%L", function(d) { return d.getMilliseconds(); }],
		[":%S", function(d) { return d.getSeconds(); }],
		["%I:%M", function(d) { return d.getMinutes(); }],
		["%I %p", function(d) { return d.getHours(); }],
		["%a %d", function(d) { return d.getDay() && d.getDate() != 1; }],
		["%b %d", function(d) { return d.getDate() != 1; }],
		["%b", function(d) { return d.getMonth(); }],
		["%Y", function() { return true; }]
	]);

	var dateAxis = d3.svg.axis()
		.scale(niceDateScale)
		.orient('bottom')
		.ticks(5)
		.tickFormat(customTimeFormat)
		.outerTickSize(2)
		.tickPadding(8);

	d3.select("#date-input").selectAll(".date-input-axis")
		.data([counterData])
		.enter()
		.append("g")
		.attr("class", "date-input-axis")
		.attr("transform", "translate(0,35)")
		.call(dateAxis);

	var marker = d3.select("#date-input").selectAll(".date-input-marker")
		.data([counterData])
		.enter()
		.append("circle")
		.attr("class", "date-input-marker")
		.attr("cx", function(d) {return d.x})
		.attr("cy", 35)
		.attr("r", 5)
		.style("fill", "#5DA8A3")
		.style("cursor", "pointer")
		.call(drag);

	d3.select("#reset")
		.on("click", function(d) {
			var dMin = d3.min(xValues),
				dMax = d3.max(xValues),
				lMin = d3.min(yValues),
				lMax = d3.max(yValues);
			rescale(dMin, dMax, lMin, lMax, xScale, yScale, nodes, links, tips, internals, vaccines);
		})

	d3.select("#coloring")
		.style("cursor", "pointer")
		.on("change", function(d) {

			colorBy = d3.select(this).node().value;

			if (colorBy == "ep") {
				colorScale = epitopeColorScale;
				tips.map(function(d) { d.coloring = d.ep; });
			}
			if (colorBy == "ne") {
				colorScale = nonepitopeColorScale;
				tips.map(function(d) { d.coloring = d.ne; });
			}
			if (colorBy == "rb") {
				colorScale = receptorBindingColorScale;
				tips.map(function(d) { d.coloring = d.rb; });
			}
			if (colorBy == "lbi") {
				colorScale = lbiColorScale;
				tips.map(function(d) { d.adj_coloring = d.LBI; });
			}

			adjust_coloring_by_date();

			d3.selectAll(".tip")
				.attr("r", function(d) {
					return recencySizeScale(d.diff);
				})
				.style("fill", function(d) {
					var col = colorScale(d.adj_coloring);
					return d3.rgb(col).brighter([0.7]).toString();
				})
				.style("stroke", function(d) {
					var col = colorScale(d.adj_coloring);
					return d3.rgb(col).toString();
				});

		})

	function onSelect(tip) {
		d3.select("#"+(tip.strain).replace(/\//g, ""))
			.call(function(d) {
				virusTooltip.show(tip, d[0][0]);
			});
	}

	var mc = autocomplete(document.getElementById('search'))
		.keys(tips)
		.dataField("strain")
		.placeHolder("search strains...")
		.width(800)
		.height(500)
		.onSelected(onSelect)
		.render();

});


d3.json("https://s3.amazonaws.com/augur-data/auspice/meta.json", function(error, json) {
	if (error) return console.warn(error);
	d3.select("#updated").text(json['updated']);
});
