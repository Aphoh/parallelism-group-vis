'use client'; 
import React, { useState, useEffect } from 'react';

class RankGenerator {
    constructor(tp, ep, dp, pp, cp, order, rankOffset = 0) {
        this.tp = tp;
        this.ep = ep;
        this.dp = dp;
        this.pp = pp;
        this.cp = cp;
        this.rankOffset = rankOffset;
        this.worldSize = tp * dp * pp * cp;

        this.nameToSize = { tp, pp, dp, ep, cp };
        this.order = order.toLowerCase();

        if (this.order.includes('ep') && !this.order.includes('ep-dp') && !this.order.includes('dp-ep')) {
            throw new Error(`The ep and dp must be adjacent in order (${this.order}).`);
        }

        for (const [name, size] of Object.entries(this.nameToSize)) {
            if (!this.order.includes(name) && size !== 1) {
                throw new Error(`The size of (${name}) is (${size}), but you haven't specified the order (${this.order}).`);
            } else if (!this.order.includes(name)) {
                this.order += `-${name}`;
            }
        }

        this.orderWithEp = this.order;
        this.orderWithoutEp = this.order.split('-').filter(token => token !== 'ep').join('-');
        this.orderedSizeWithoutEp = [];
        this.orderedSizeWithEp = [];

        for (const token of this.order.split('-')) {
            if (token === 'dp') {
                this.orderedSizeWithEp.push(this.dp / this.ep);
                this.orderedSizeWithoutEp.push(this.dp);
            } else if (token === 'ep') {
                this.orderedSizeWithEp.push(this.ep);
            } else {
                this.orderedSizeWithEp.push(this.nameToSize[token]);
                this.orderedSizeWithoutEp.push(this.nameToSize[token]);
            }
        }
    }

    getMask(order, token) {
        const orderedToken = order.split('-');
        const tokens = token.split('-');
        const mask = new Array(orderedToken.length).fill(false);
        for (const t of tokens) {
            mask[orderedToken.indexOf(t)] = true;
        }
        return mask;
    }

    getRanks(token, independentEp = false) {
        const parallelSize = independentEp ? this.orderedSizeWithEp : this.orderedSizeWithoutEp;
        const order = independentEp ? this.orderWithEp : this.orderWithoutEp;
        const mask = this.getMask(order, token);
        const ranks = generateMaskedOrthogonalRankGroups(this.worldSize, parallelSize, mask);
        
        if (this.rankOffset > 0) {
            for (const rankGroup of ranks) {
                for (let i = 0; i < rankGroup.length; i++) {
                    rankGroup[i] += this.rankOffset;
                }
            }
        }
        return ranks;
    }
}

function generateMaskedOrthogonalRankGroups(worldSize, parallelSize, mask) {
    function prefixProduct(a, init = 1) {
        const r = [init];
        for (const v of a) {
            init *= v;
            r.push(init);
        }
        return r;
    }

    function innerProduct(a, b) {
        return a.reduce((sum, x, i) => sum + x * b[i], 0);
    }

    function decompose(index, shape, stride = null) {
        if (!stride) {
            stride = prefixProduct(shape);
        }
        const idx = shape.map((s, i) => Math.floor(index / stride[i]) % s);
        return idx;
    }

    const maskedShape = parallelSize.filter((_, i) => mask[i]);
    const unmaskedShape = parallelSize.filter((_, i) => !mask[i]);

    const globalStride = prefixProduct(parallelSize);
    const maskedStride = globalStride.filter((_, i) => mask[i]);
    const unmaskedStride = globalStride.filter((_, i) => !mask[i]);

    const groupSize = maskedShape.reduce((a, b) => a * b, 1);
    const numOfGroup = Math.floor(worldSize / groupSize);

    const ranks = [];
    for (let groupIndex = 0; groupIndex < numOfGroup; groupIndex++) {
        const decomposedGroupIdx = decompose(groupIndex, unmaskedShape);
        const rank = [];
        for (let rankInGroup = 0; rankInGroup < groupSize; rankInGroup++) {
            const decomposedRankIdx = decompose(rankInGroup, maskedShape);
            rank.push(
                innerProduct(decomposedRankIdx, maskedStride) +
                innerProduct(decomposedGroupIdx, unmaskedStride)
            );
        }
        ranks.push(rank);
    }
    return ranks;
}

const generateColor = (index) => {
  const hue = (index * 137.5) % 360;
  return `hsl(${hue}, 70%, 80%)`;
};

const calculateSizeAndStride = (ranks) => {
  if (ranks.length === 0) return { size: 0, stride: 0 };
  const size = ranks[0].length;
  let stride = 1;
  let group_stride = 1;
  if (ranks.length > 0 && ranks[0].length > 1) {
    stride = ranks[0][1] - ranks[0][0]; 
    group_stride = ranks[1][0] - ranks[0][0];
  }
  return { size, stride, group_stride };
};

const RankGroupVisualizer = () => {
  const [tp, setTp] = useState(2);
  const [ep, setEp] = useState(1);
  const [dp, setDp] = useState(2);
  const [pp, setPp] = useState(2);
  const [cp, setCp] = useState(1);
  const [order, setOrder] = useState('tp-cp-ep-dp-pp');
  const [subgroup, setSubgroup] = useState('tp');
  const [grid, setGrid] = useState([]);
  const [groupColors, setGroupColors] = useState({});
  const [parallelismInfo, setParallelismInfo] = useState({});
  const [error, setError] = useState(null);

  useEffect(() => {
    try {
      updateGrid();
    } catch (err) {
      console.error('Error in updateGrid:', err);
      setError(err.message);
    }
  }, [tp, ep, dp, pp, cp, order, subgroup]);

  const updateGrid = () => {
    try {
      const rankGenerator = new RankGenerator(tp, ep, dp, pp, cp, order);
      const worldSize = tp * ep * dp * pp * cp;
      const ranks = rankGenerator.getRanks(subgroup);

      const newGrid = [];
      const newGroupColors = {};
      for (let i = 0; i < worldSize; i++) {
        const groupIndex = ranks.findIndex(group => group.includes(i));
        newGrid.push({ rank: i, group: groupIndex });
        if (!newGroupColors[groupIndex]) {
          newGroupColors[groupIndex] = generateColor(groupIndex);
        }
      }
      setGrid(newGrid);
      setGroupColors(newGroupColors);

      // Calculate size and stride for each parallelism type
      const newParallelismInfo = {};
      ['tp', 'cp', 'ep', 'dp', 'pp'].forEach(type => {
        const typeRanks = rankGenerator.getRanks(type);
        newParallelismInfo[type] = calculateSizeAndStride(typeRanks);
      });
      setParallelismInfo(newParallelismInfo);

      setError(null);
    } catch (error) {
      console.error('Error updating grid:', error);
      setGrid([]);
      setGroupColors({});
      setParallelismInfo({});
      setError(error.message);
    }
  };

  if (error) {
    return <div className="text-red-500">Error: {error}</div>;
  }

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Rank Group Visualizer</h1>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block">Tensor Parallel Size:</label>
          <input type="number" value={tp} onChange={(e) => setTp(parseInt(e.target.value))} className="w-full border rounded p-1" min="1" />
        </div>
        <div>
          <label className="block">Context Parallel Size:</label>
          <input type="number" value={cp} onChange={(e) => setCp(parseInt(e.target.value))} className="w-full border rounded p-1" min="1" />
        </div>
        <div>
          <label className="block">Expert Parallel Size:</label>
          <input type="number" value={ep} onChange={(e) => setEp(parseInt(e.target.value))} className="w-full border rounded p-1" min="1" />
        </div>
        <div>
          <label className="block">Data Parallel Size:</label>
          <input type="number" value={dp} onChange={(e) => setDp(parseInt(e.target.value))} className="w-full border rounded p-1" min="1" />
        </div>
        <div>
          <label className="block">Pipeline Parallel Size:</label>
          <input type="number" value={pp} onChange={(e) => setPp(parseInt(e.target.value))} className="w-full border rounded p-1" min="1" />
        </div>
        <div>
          <label className="block">Order:</label>
          <input type="text" value={order} onChange={(e) => setOrder(e.target.value)} className="w-full border rounded p-1" />
        </div>
        <div>
          <label className="block">Subgroup:</label>
          <select value={subgroup} onChange={(e) => setSubgroup(e.target.value)} className="w-full border rounded p-1">
            <option value="tp">tp</option>
            <option value="pp">pp</option>
            <option value="dp">dp</option>
            <option value="ep">ep</option>
            <option value="cp">cp</option>
          </select>
        </div>
      </div>
      <div className="mb-4">
        <h2 className="text-xl font-semibold mb-2">Parallelism Information</h2>
        <div className="grid grid-cols-5 gap-2">
          {Object.entries(parallelismInfo).map(([type, info]) => (
            <div key={type} className="border rounded p-2">
              <h3 className="font-bold">{type.toUpperCase()}</h3>
              <p>Size: {info.size}</p>
              <p>Stride: {info.stride}</p>
              <p>Group Stride: {info.group_stride}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
        {grid.map(({ rank, group }) => (
          <div
            key={rank}
            className="border rounded p-2 text-center"
            style={{ backgroundColor: groupColors[group] }}
          >
            <div className="text-sm">Rank {rank}</div>
            <div className="font-bold">Group {group}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default RankGroupVisualizer;

