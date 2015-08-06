var PlayerTracker = require('../PlayerTracker');
var math = require('mathjs');



function BotNN() {
    PlayerTracker.apply(this, Array.prototype.slice.call(arguments));
    //this.color = gameServer.getRandomColor();

    // AI only
    this.gameState = 0;
    this.path = [];

    this.predators = []; // List of cells that can eat this bot
    this.threats = []; // List of cells that can eat this bot but are too far away
    this.prey = []; // List of cells that can be eaten by this bot
    this.food = [];
    this.foodImportant = []; // Not used - Bots will attempt to eat this regardless of nearby prey/predators
    this.virus = []; // List of viruses

    this.juke = false;

    this.target;
    this.targetVirus; // Virus used to shoot into the target

    this.ejectMass = 0; // Amount of times to eject mass
    this.oldPos = {x: 0, y:0};

    this.genome = [] // Genotype
    this.weights1 = [] // Phenotype 1
    this.weights2 = [] // Phenotype 2


    this.nbInputs = 18
    this.nbHiddens = 9
    this.nbOuputs = 4

    this.mutation_rate = 0.001;
    this.sigma_gaussian = 0.01;

    this.initGenomeRandom();
    this.genomeToWeights();

}

module.exports = BotNN;
BotNN.prototype = new PlayerTracker();

// Functions
BotNN.prototype.initGenomeRandom= function(){
    this.genome=math.matrix(math.random([211,1]));

}

BotNN.prototype.genomeToWeights=function(){
    this.weights1=math.matrix(this.genome.subset(math.index(math.range(0,171),0)));
    this.weights1.resize([9,19]);
    this.weights2=math.matrix(this.genome.subset(math.index(math.range(171,211),0)));
    this.weights2.resize([4,10]);



}

BotNN.prototype.getLowestCell = function() {
    // Gets the cell with the lowest mass
    if (this.cells.length <= 0) {
        return null; // Error!
    }
    
    // Starting cell
    var lowest = this.cells[0];
    for (i = 1; i < this.cells.length; i++) {
        if (lowest.mass > this.cells[i].mass) {
            lowest = this.cells[i];
        }
    }
    return lowest;
};

// Override

BotNN.prototype.updateSightRange = function() { // For view distance
    var range = 1000; // Base sight range

    if (this.cells[0]) {
        range += this.cells[0].getSize() * 2.5;
    }

    this.sightRangeX = range;
    this.sightRangeY = range;
};

BotNN.prototype.mutate = function() {
    for (var i = 0; i < this.genome.length; i++) {
        if(Math.random() < this.mutation_rate) {

        }
    }
}

BotNN.prototype.update = function() { // Overrides the update function from player tracker


    // Remove nodes from visible nodes if possible
    var lastKiller = null;
    for (var i = 0; i < this.nodeDestroyQueue.length; i++) {
        var index = this.visibleNodes.indexOf(this.nodeDestroyQueue[i]);
        if (index > -1) {
            this.visibleNodes.splice(index, 1);
            lastKiller = this.nodeDestroyQueue[i].killedBy.owner;
        }
    }

    // Update every 500 ms
    if ((this.tickViewBox <= 0) && (this.gameServer.run)) {
        this.visibleNodes = this.calcViewBox();
        this.tickViewBox = 10;
    } else {
        this.tickViewBox--;
        return;
    }

    // TODO: Change this so that the bot respown with its predator's genome
    // Respawn if bot is dead
    if (this.cells.length <= 0) {
	this.initGenomeRandom();
	this.genomeToWeights();
        this.gameServer.gameMode.onPlayerSpawn(this.gameServer,this);

        // We take the genotype of our killer
        if(lastKiller) {
            this.genome = lastKiller.genome;
        }
        else {
            // TODO: random genome
            this.genome = []
        }

        if (this.cells.length == 0) {
            // If the bot cannot spawn any cells, then disconnect it
            this.socket.close();
            return;
        }
    }

    // Calc predators/prey
    var cell = this.getLowestCell();
    var r = cell.getSize();
    this.clearLists();

    // Ignores targeting cells below this mass
    var ignoreMass = Math.min((cell.mass / 10), 150); 

    // Loop
    for (i in this.visibleNodes) {
        var check = this.visibleNodes[i];

        // Cannot target itself
        if ((!check) || (cell.owner == check.owner)){
            continue;
        }

        var t = check.getType();
        switch (t) {
            case 0:
                // Cannot target teammates
                if (this.gameServer.gameMode.haveTeams) {
                    if (check.owner.team == this.team) {
                        continue;
                    }
                }

                // Check for danger
                if (cell.mass > (check.mass * 1.25)) {
                    // Add to prey list
                    this.prey.push(check);
                } else if (check.mass > (cell.mass * 1.25)) {
                    // Predator
                    var dist = this.getDist(cell, check) - (r + check.getSize());
                    if (dist < 300) {
                        this.predators.push(check);
                        if ((this.cells.length == 1) && (dist < 0)) {
                            this.juke = true;
                        }
                    }
                    this.threats.push(check);
                } else {
                    this.threats.push(check);
                }
                break;
            case 1:
                this.food.push(check);
                break;
            case 2: // Virus
                this.virus.push(check);
                break;
            case 3: // Ejected mass
                if (cell.mass > 20) {
                    this.food.push(check);
                }
                break;
            default:
                break;
        }
    }

    // Neural network computing

    // Inputs neurons
    var inputsMatrix = math.matrix(this.getInputs(cell));
    console.log('input');
    console.log(inputsMatrix);
    // Input-Hidden weights
//    var weightsMatrix = math.matrix(this.weights.slice(0, (this.nbInputs + 1)*this.nbHiddens));

//    var hiddenMatrix = math.multiply(inputsMatrix, weightsMatrix);
    var hiddenMatrix=math.multiply(this.weights1,inputsMatrix);

    // Apply sigmoid activation function
    var lambda = 5.0;
    hiddenMatrix = hiddenMatrix.map(function (value, index, matrix) {
        return (1.0 / (math.exp(-value * lambda) + 1));
    });

//    weightsMatrix = math.matrix(this.weights.slice((this.nbInputs + 1)*this.nbHiddens, this.weights.length));

//    var outputs = math.multiply(hiddenMatrix, weightsMatrix);
    hiddenMatrix.resize([10],1);
    console.log('hidden');
    console.log(hiddenMatrix);

    outputs=math.multiply(this.weights2,hiddenMatrix);

    // Apply sigmoid activation function
    outputs = outputs.map(function (value, index, matrix) {
        return (1.0 / (math.exp(-value * lambda) + 1));
    });

    // Action
    this.decide(cell, outputs);

    this.nodeDestroyQueue = []; // Empty

};

BotNN.prototype.getInputs = function(cell) {
    // Nearest prey
    var nearestCellInfo = this.getInfoNearest(cell, this.prey);

    // Nearest predator
    nearestCellInfo = nearestCellInfo.concat(this.getInfoNearest(cell, this.predators))

    // Nearest threat
    nearestCellInfo = nearestCellInfo.concat(this.getInfoNearest(cell, this.threats))

    // Nearest food
    nearestCellInfo = nearestCellInfo.concat(this.getInfoNearest(cell, this.food))

    // Nearest virus
    nearestCellInfo = nearestCellInfo.concat(this.getInfoNearest(cell, this.virus))

    var inputsNN = nearestCellInfo;

    // Mass
    inputsNN.push(this.getTotalMass());

    // Lowest cell mass
    inputsNN.push(cell.mass);

    // Number of cells
    inputsNN.push(this.cells.length);
    inputsNN.push(1); //bias
    return inputsNN;
}

// Returns [cosinus, sinus, distance] to the nearest cell in the given list
BotNN.prototype.getInfoNearest = function(cell, list) {
    var cellInfo = [];   
    if( list.length!=0)
    {
	nearestCell = this.findNearest(cell, list);
    
   

	// Find angle of vector between current cell and nearest cell
	var deltaY = nearestCell.y - cell.position.y;
	var deltaX = nearestCell.x - cell.position.x;
	var angle = Math.atan2(deltaX, deltaY);
	
	// Now reverse the angle
	if (angle > Math.PI) {
            angle -= Math.PI;
	} else {
        angle += Math.PI;
	}
	
	cellInfo.push(Math.cos(angle));
	cellInfo.push(Math.sin(angle));
	
	var distance = Math.sqrt((deltaX * deltaX) + (deltaY * deltaY));
	cellInfo.push(distance);
	
	
    }
    else
    {
	cellInfo.push(-1);
	cellInfo.push(0);
	cellInfo.push(1);
    }
    return cellInfo;
}

BotNN.prototype.getTotalMass = function() {
    var mass = 0;
    for (var i = 0; i < this.cells.length; i++) {
        mass += this.cells[i].mass;
    }

    return mass
}

// Custom
BotNN.prototype.clearLists = function() {
    this.predators = [];
    this.threats = [];
    this.prey = [];
    this.food = [];
    this.virus = [];
    this.juke = false;
};

BotNN.prototype.getState = function(cell) {
    // Continue to shoot viruses
    if (this.gameState == 4) {
        return 4;
    }

    // Check for predators
    if (this.predators.length <= 0) {
        if (this.prey.length > 0) {
            return 3;
        } else if (this.food.length > 0) {
            return 1;
        }
    } else if (this.threats.length > 0) {
        if ((this.cells.length == 1) && (cell.mass > 180)) {
            var t = this.getBiggest(this.threats);
            var tl = this.findNearbyVirus(t,500,this.virus);
            if (tl != false) {
                this.target = t;
                this.targetVirus = tl;
                return 4;
            }
        } else {
            // Run
            return 2;
        }
    }

    // Bot wanders by default
    return 0;
};

BotNN.prototype.decide = function(cell, outputs) {
    console.log('outputs');
    console.log(outputs);
   
// Computation of of mouse.x and mouse.y
    // The idea is that outputs[0] (resp. outputs[1]) represents x (resp. y) as a ratio of
    // the width (resp. height) in the viewBox.
    this.mouse.x = this.viewBox.leftX + outputs.subset(math.index(0)) * this.viewBox.width;
    this.mouse.y = this.viewBox.bottomY + outputs.subset(math.index(1)) * this.viewBox.height;
    
    // Split decision
    if (outputs.subset(math.index(2)) > 0.5) {
        this.gameServer.splitCells(this);
    }

    if (outputs.subset(math.index(3)) > 0.5) {
        this.gameServer.ejectMass(this);
    }
};

// Finds the nearest cell in list
BotNN.prototype.findNearest = function(cell,list) {
    if (this.currentTarget) {
        // Do not check for food if target already exists
        return null;
    }

    // Check for nearest cell in list
    var shortest = list[0];
    var shortestDist = this.getDist(cell,shortest);
    for (var i = 1; i < list.length; i++) {
        var check = list[i];
        var dist = this.getDist(cell,check);
        if (shortestDist > dist) {
            shortest = check;
            shortestDist = dist;
        }
    }

    return shortest;
};

BotNN.prototype.getRandom = function(list) {
    // Gets a random cell from the array
    var n = Math.floor(Math.random() * list.length);
    return list[n];
};

BotNN.prototype.combineVectors = function(list) {
    // Gets the angles of all enemies approaching the cell
    var pos = {x: 0, y: 0};
    var check;
    for (var i = 0; i < list.length; i++) {
        check = list[i];
        pos.x += check.position.x;
        pos.y += check.position.y;
    }

    // Get avg
    pos.x = pos.x/list.length;
    pos.y = pos.y/list.length;

    return pos;
};

BotNN.prototype.checkPath = function(cell,check) {
    // Checks if the cell is in the way

    // Get angle of vector (cell -> path)
    var v1 = Math.atan2(cell.position.x - this.mouse.x,cell.position.y - this.mouse.y);

    // Get angle of vector (virus -> cell)
    var v2 = this.getAngle(check,cell);
    v2 = this.reverseAngle(v2);

    if ((v1 <= (v2 + .25) ) && (v1 >= (v2 - .25) )) {
        return true;
    } else {
        return false;
    }
};

BotNN.prototype.getBiggest = function(list) {
    // Gets the biggest cell from the array
    var biggest = list[0];
    for (var i = 1; i < list.length; i++) {
        var check = list[i];
        if (check.mass > biggest.mass) {
            biggest = check;
        }
    }

    return biggest;
};

BotNN.prototype.findNearbyVirus = function(cell,checkDist,list) {
    var r = cell.getSize() + 100; // Gets radius + virus radius
    for (var i = 0; i < list.length; i++) {
        var check = list[i];
        var dist = this.getDist(cell,check) - r;
        if (checkDist > dist) {
            return check;
        }
    }
    return false; // Returns a bool if no nearby viruses are found
};

BotNN.prototype.checkPath = function(cell,check) {
    // Get angle of path
    var v1 = Math.atan2(cell.position.x - player.mouse.x,cell.position.y - player.mouse.y);

    // Get angle of vector (cell -> virus)
    var v2 = this.getAngle(cell,check);
    var dist = this.getDist(cell,check);

    var inRange = Math.atan((2 * cell.getSize())/dist); // Opposite/adjacent
    console.log(inRange);
    if ((v1 <= (v2 + inRange)) && (v1 >= (v2 - inRange))) {
        // Path collides
        return true;
    } 

    // No collide
    return false;
}

BotNN.prototype.getDist = function(cell,check) {
    // Fastest distance - I have a crappy computer to test with :(
    var xd = (check.position.x - cell.position.x);
    xd = xd < 0 ? xd * -1 : xd; // Math.abs is slow

    var yd = (check.position.y - cell.position.y);
    yd = yd < 0 ? yd * -1 : yd; // Math.abs is slow

    return (xd + yd);
};

BotNN.prototype.getAccDist = function(cell,check) {
    // Accurate Distance
    var xs = check.position.x - cell.position.x;
    xs = xs * xs;

    var ys = check.position.y - cell.position.y;
    ys = ys * ys;

    return Math.sqrt( xs + ys );
};

BotNN.prototype.getAngle = function(c1,c2) {
    var deltaY = c1.position.y - c2.position.y;
    var deltaX = c1.position.x - c2.position.x;
    return Math.atan2(deltaX,deltaY);
};

BotNN.prototype.reverseAngle = function(angle) {
    if (angle > Math.PI) {
        angle -= Math.PI;
    } else {
        angle += Math.PI;
    }
    return angle;
};

