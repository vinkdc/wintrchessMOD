import React from "react";

import useAnalysisBoardStore from "@analysis/stores/AnalysisBoardStore";
import MoveListCard from "@analysis/components/report/MoveListCard";

import EvaluationGraphArea from "./EvaluationGraphArea";

function GameReport() {
    useAnalysisBoardStore(state => state.currentStateTreeNodeUpdate);

    return <>
        <MoveListCard/>

        <EvaluationGraphArea/>
    </>;
}

export default GameReport;
