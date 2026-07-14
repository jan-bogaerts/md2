import type { FocusEvent } from 'react'
import type { RowRendererProps } from 'react-arborist'
import type { TreeNode } from '../../data/file_tree'

/** Constrains react-arborist rows to the viewport so hidden actions cannot create horizontal overflow. */
export function FileTreeRow(props: RowRendererProps<TreeNode>) {
    const { attrs, children, innerRef, node } = props

    const handleFocus = (event: FocusEvent<HTMLDivElement>) => {
        event.stopPropagation()
    }

    return (
        <div
            {...attrs}
            ref={innerRef}
            onClick={node.handleClick}
            onFocus={handleFocus}
            style={{ ...attrs.style, boxSizing: 'border-box', maxWidth: '100%', minWidth: 0, overflow: 'hidden' }}
        >
            {children}
        </div>
    )
}
